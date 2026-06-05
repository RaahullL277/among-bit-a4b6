import { useState } from 'react';
import { ShoppingCart, Save, Play } from 'lucide-react';
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
  Badge,
  EmptyState,
  formatMoney,
} from '../components/ui';

function cartTotal(cart) {
  return (cart.items ?? []).reduce((s, i) => s + i.unitPriceMinor * i.quantity, 0);
}

function RecoveryPolicy({ storeId }) {
  const { data, loading, reload } = useAsync(() => api.carts.getPolicy(storeId), [storeId]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const policy = form ?? (data
    ? {
        enabled: data.enabled,
        abandonAfterMinutes: data.abandonAfterMinutes,
        stepDelays: (data.stepDelaysMinutes ?? []).join(', '),
      }
    : null);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.carts.setPolicy({
        storeId,
        enabled: policy.enabled,
        abandonAfterMinutes: Number(policy.abandonAfterMinutes),
        stepDelaysMinutes: String(policy.stepDelays)
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !Number.isNaN(n)),
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

  return (
    <form onSubmit={save} className="space-y-4 p-5">
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          className="h-4 w-4 accent-indigo-600"
          checked={policy.enabled}
          onChange={(e) => setForm({ ...policy, enabled: e.target.checked })}
        />
        Recovery enabled
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Abandon after (minutes)">
          <Input
            type="number"
            min="1"
            value={policy.abandonAfterMinutes}
            onChange={(e) => setForm({ ...policy, abandonAfterMinutes: e.target.value })}
          />
        </Field>
        <Field label="Step delays (minutes, comma-separated)" hint="After abandonment, e.g. 0, 1440, 4320">
          <Input
            value={policy.stepDelays}
            onChange={(e) => setForm({ ...policy, stepDelays: e.target.value })}
          />
        </Field>
      </div>
      <ErrorBanner message={error} />
      <Button type="submit" loading={saving}>
        <Save size={14} /> Save policy
      </Button>
    </form>
  );
}

export default function Carts() {
  const { selectedId, selectedStore } = useStores();
  const { data: carts, loading, error, reload } = useAsync(
    () => (selectedId ? api.carts.list(selectedId) : Promise.resolve([])),
    [selectedId],
  );
  const [running, setRunning] = useState(false);

  async function runRecovery() {
    setRunning(true);
    try {
      await api.carts.runRecovery();
      reload();
    } finally {
      setRunning(false);
    }
  }

  if (!selectedId) {
    return (
      <Card>
        <EmptyState icon={ShoppingCart} title="Select a store">
          Choose a store from the switcher above to view its carts.
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Carts</h1>
        <Button variant="secondary" onClick={runRecovery} loading={running}>
          <Play size={14} /> Run recovery now
        </Button>
      </div>

      <Card>
        <CardHeader title="Abandoned-cart recovery" subtitle={selectedStore?.name} />
        <RecoveryPolicy storeId={selectedId} />
      </Card>

      <Card>
        <CardHeader title="Carts" subtitle="Active, abandoned, and converted" />
        {loading ? (
          <Spinner />
        ) : error ? (
          <div className="p-5"><ErrorBanner message={error} /></div>
        ) : carts?.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="No carts yet">
            Carts created via the API or MCP appear here.
          </EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-5 py-3 font-medium">Cart</th>
                <th className="px-5 py-3 font-medium">Contact</th>
                <th className="px-5 py-3 font-medium">Items</th>
                <th className="px-5 py-3 font-medium">Value</th>
                <th className="px-5 py-3 font-medium">Recovery</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {carts?.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">{c.id.slice(-8)}</td>
                  <td className="px-5 py-3 text-slate-600">{c.contactEmail ?? c.contactPhone ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-500">
                    {(c.items ?? []).reduce((s, i) => s + i.quantity, 0)}
                  </td>
                  <td className="px-5 py-3 text-slate-700">{formatMoney(cartTotal(c))}</td>
                  <td className="px-5 py-3 text-slate-500">
                    {c.status === 'ABANDONED' ? `${c.recoveryStepsSent} sent` : '—'}
                  </td>
                  <td className="px-5 py-3"><Badge>{c.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
