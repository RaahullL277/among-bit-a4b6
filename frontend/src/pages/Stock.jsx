import { useState } from 'react';
import { Activity, Save, RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import { useStores } from '../context/StoreContext';
import { useAsync } from '../hooks/useAsync';
import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Spinner,
  ErrorBanner,
  EmptyState,
  StockDot,
} from '../components/ui';

function StockPolicy({ storeId }) {
  const { data, loading, reload } = useAsync(() => api.stock.getPolicy(storeId), [storeId]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const policy = form ?? data;

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.stock.setPolicy({
        storeId,
        enabled: policy.enabled,
        greenDays: Number(policy.greenDays),
        amberDays: Number(policy.amberDays),
        reorderPoint: Number(policy.reorderPoint),
        velocityWindowDays: Number(policy.velocityWindowDays),
      });
      setForm(null);
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading || !policy) return <Spinner />;

  const set = (k) => (e) => setForm({ ...policy, [k]: e.target.value });

  return (
    <form onSubmit={save} className="space-y-4 p-5">
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          className="h-4 w-4 accent-indigo-600"
          checked={policy.enabled}
          onChange={(e) => setForm({ ...policy, enabled: e.target.checked })}
        />
        Stock alerts enabled
      </label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="🟢 Green ≥ days"><Input type="number" value={policy.greenDays} onChange={set('greenDays')} /></Field>
        <Field label="🟠 Amber ≥ days"><Input type="number" value={policy.amberDays} onChange={set('amberDays')} /></Field>
        <Field label="Reorder point"><Input type="number" value={policy.reorderPoint} onChange={set('reorderPoint')} /></Field>
        <Field label="Velocity window (d)"><Input type="number" value={policy.velocityWindowDays} onChange={set('velocityWindowDays')} /></Field>
      </div>
      <ErrorBanner message={error} />
      <Button type="submit" loading={saving}>
        <Save size={14} /> Save thresholds
      </Button>
    </form>
  );
}

export default function Stock() {
  const { selectedId, selectedStore } = useStores();
  const { data: rows, loading, error, reload } = useAsync(
    () => (selectedId ? api.stock.status(selectedId) : Promise.resolve([])),
    [selectedId],
  );
  const [running, setRunning] = useState(false);

  async function recompute() {
    setRunning(true);
    try {
      await api.stock.recompute();
      reload();
    } finally {
      setRunning(false);
    }
  }

  if (!selectedId) {
    return (
      <Card>
        <EmptyState icon={Activity} title="Select a store">
          Choose a store from the switcher above to view stock health.
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Stock</h1>
        <Button variant="secondary" onClick={recompute} loading={running}>
          <RefreshCw size={14} /> Recompute & alert
        </Button>
      </div>

      <Card>
        <CardHeader title="Alert thresholds" subtitle={`${selectedStore?.name} · days-of-cover bands`} />
        <StockPolicy storeId={selectedId} />
      </Card>

      <Card>
        <CardHeader title="Stock health" subtitle="Red / amber / green by days of cover" />
        {loading ? (
          <Spinner />
        ) : error ? (
          <div className="p-5"><ErrorBanner message={error} /></div>
        ) : rows?.length === 0 ? (
          <EmptyState icon={Activity} title="No variants yet" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-5 py-3 font-medium">Product</th>
                <th className="px-5 py-3 font-medium">Inventory</th>
                <th className="px-5 py-3 font-medium">Sales/day</th>
                <th className="px-5 py-3 font-medium">Days cover</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((r) => (
                <tr key={r.variantId} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-900">{r.productTitle}</div>
                    <div className="text-xs text-slate-400">{r.title}{r.sku ? ` · ${r.sku}` : ''}</div>
                  </td>
                  <td className="px-5 py-3 text-slate-700">{r.inventory}</td>
                  <td className="px-5 py-3 text-slate-500">{r.dailyVelocity.toFixed(2)}</td>
                  <td className="px-5 py-3 text-slate-500">
                    {r.daysOfCover == null ? '∞' : Math.round(r.daysOfCover)}
                  </td>
                  <td className="px-5 py-3"><StockDot status={r.status} label={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
