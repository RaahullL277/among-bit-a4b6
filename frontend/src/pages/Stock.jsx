import { useState } from 'react';
import { Activity, Save, RefreshCw, Plus } from 'lucide-react';
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
        trackInventory: policy.trackInventory,
        allowBackorder: policy.allowBackorder,
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
      <div className="space-y-2 border-t border-slate-100 pt-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={policy.trackInventory} onChange={(e) => setForm({ ...policy, trackInventory: e.target.checked })} />
          Track inventory — consume stock on sale &amp; block overselling
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={policy.allowBackorder} disabled={!policy.trackInventory} onChange={(e) => setForm({ ...policy, allowBackorder: e.target.checked })} />
          Allow backorders — accept orders beyond available stock (stock can go negative)
        </label>
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
        <CardHeader title="Stock health" subtitle="Red / amber / green · click an inventory count to recount" />
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
                  <td className="px-5 py-3"><InventoryCell variantId={r.variantId} value={r.inventory} onSaved={reload} /></td>
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

      <StockLedger storeId={selectedId} key={selectedId} />
    </div>
  );
}

function InventoryCell({ variantId, value, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(value));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const n = Math.max(0, Math.round(Number(val)));
      if (n !== value) await api.stock.setInventory({ variantId, quantity: n, note: 'admin recount' });
      setEditing(false);
      onSaved?.();
    } finally { setBusy(false); }
  }
  async function receive() {
    setBusy(true);
    try { await api.stock.receive({ variantId, quantity: 1, note: 'admin receive' }); onSaved?.(); } finally { setBusy(false); }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <button onClick={() => { setVal(String(value)); setEditing(true); }} className={`rounded px-1.5 py-0.5 font-medium hover:bg-slate-100 ${value <= 0 ? 'text-rose-600' : 'text-slate-700'}`}>{value}</button>
        <button onClick={receive} disabled={busy} title="Receive +1" className="rounded p-1 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"><Plus size={13} /></button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus type="number" min={0} value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-sm"
      />
      <button onClick={save} disabled={busy} className="rounded bg-indigo-600 px-1.5 py-0.5 text-xs font-medium text-white">Set</button>
    </div>
  );
}

const REASON_BADGE = {
  SALE: 'bg-rose-100 text-rose-700', RETURN: 'bg-emerald-100 text-emerald-700',
  CANCEL: 'bg-emerald-100 text-emerald-700', RECEIVE: 'bg-sky-100 text-sky-700', ADJUST: 'bg-amber-100 text-amber-700',
};

function StockLedger({ storeId }) {
  const { data, loading } = useAsync(() => api.stock.ledger(storeId), [storeId]);
  if (loading) return null;
  return (
    <Card>
      <CardHeader title="Movement ledger" subtitle="Every inventory change — sale, return, cancel, receive, manual" />
      {(data ?? []).length === 0 ? (
        <EmptyState icon={Activity} title="No movements yet">Stock changes will appear here.</EmptyState>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
              <th className="px-5 py-2 font-medium">Reason</th><th className="px-5 py-2 font-medium">Change</th>
              <th className="px-5 py-2 font-medium">Balance</th><th className="px-5 py-2 font-medium">By</th>
              <th className="px-5 py-2 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((m) => (
              <tr key={m.id} className="border-b border-slate-50 last:border-0">
                <td className="px-5 py-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${REASON_BADGE[m.reason] ?? 'bg-slate-100 text-slate-600'}`}>{m.reason}</span>{m.note && <span className="ml-1.5 text-xs text-slate-400">{m.note}</span>}</td>
                <td className={`px-5 py-2 font-medium ${m.delta < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                <td className="px-5 py-2 text-slate-700">{m.balance}</td>
                <td className="px-5 py-2 text-xs text-slate-400">{m.actorKind ?? 'system'}</td>
                <td className="px-5 py-2 text-xs text-slate-400">{new Date(m.createdAt).toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
