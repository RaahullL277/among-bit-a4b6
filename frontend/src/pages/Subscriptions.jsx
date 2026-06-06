import { useState } from 'react';
import { RefreshCw, Pause, Play, X, Repeat } from 'lucide-react';
import { api } from '../api/client';
import { useStores } from '../context/StoreContext';
import { useAsync } from '../hooks/useAsync';
import { Button, Card, CardHeader, Field, Input, Spinner, ErrorBanner, Badge, EmptyState } from '../components/ui';

const STATUSES = ['', 'ACTIVE', 'PAUSED', 'CANCELLED'];
const ALL_INTERVALS = ['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY'];
const INTERVAL_LABEL = { WEEKLY: 'Weekly', BIWEEKLY: 'Every 2 weeks', MONTHLY: 'Monthly', QUARTERLY: 'Quarterly' };

function SettingsCard({ storeId }) {
  const { data, reload } = useAsync(() => api.subscriptions.getSettings(storeId), [storeId]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const s = form ?? (data ? { enabled: data.enabled, discountPercent: data.discountPercent, intervals: data.intervals ?? [] } : null);

  async function save() {
    setSaving(true);
    try {
      await api.subscriptions.setSettings({ storeId, ...s, discountPercent: Number(s.discountPercent) });
      reload();
    } finally {
      setSaving(false);
    }
  }
  function toggleInterval(iv) {
    const has = s.intervals.includes(iv);
    setForm({ ...s, intervals: has ? s.intervals.filter((x) => x !== iv) : [...s.intervals, iv] });
  }
  if (!s) return null;
  return (
    <Card>
      <CardHeader title="Subscribe & save" subtitle="The recurring-order offer shown on product pages." />
      <div className="space-y-4 p-5">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={s.enabled} onChange={(e) => setForm({ ...s, enabled: e.target.checked })} />
          Offer subscriptions on the storefront
        </label>
        <Field label="Subscribe & save discount (%)">
          <Input type="number" min="0" max="100" value={s.discountPercent} onChange={(e) => setForm({ ...s, discountPercent: e.target.value })} className="max-w-[140px]" />
        </Field>
        <Field label="Intervals offered">
          <div className="flex flex-wrap gap-2">
            {ALL_INTERVALS.map((iv) => (
              <label key={iv} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs ${s.intervals.includes(iv) ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-300 text-slate-600'}`}>
                <input type="checkbox" className="hidden" checked={s.intervals.includes(iv)} onChange={() => toggleInterval(iv)} />
                {INTERVAL_LABEL[iv]}
              </label>
            ))}
          </div>
        </Field>
        <div className="flex justify-end">
          <Button onClick={save} loading={saving}>Save settings</Button>
        </div>
      </div>
    </Card>
  );
}

export default function Subscriptions() {
  const { selectedId, selectedStore } = useStores();
  const [status, setStatus] = useState('ACTIVE');
  const [busy, setBusy] = useState(false);
  const { data: subs, loading, error, reload } = useAsync(
    () => (selectedId ? api.subscriptions.list(selectedId, status || undefined) : Promise.resolve([])),
    [selectedId, status],
  );
  const { data: counts, reload: reloadCounts } = useAsync(
    () => (selectedId ? api.subscriptions.counts(selectedId) : Promise.resolve(null)),
    [selectedId],
  );

  async function act(fn) {
    setBusy(true);
    try {
      await fn();
      reload();
      reloadCounts();
    } finally {
      setBusy(false);
    }
  }

  if (!selectedId) {
    return (
      <Card>
        <EmptyState icon={Repeat} title="Select a store">Choose a store to manage subscriptions.</EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Subscriptions</h1>
        <Button variant="secondary" disabled={busy} onClick={() => act(() => api.subscriptions.runBilling())}>
          <RefreshCw size={14} /> Run billing now
        </Button>
      </div>

      <SettingsCard storeId={selectedId} />

      <Card>
        <CardHeader
          title={selectedStore?.name}
          subtitle={counts ? `${counts.ACTIVE} active · ${counts.PAUSED} paused · ${counts.CANCELLED} cancelled` : 'Active subscriptions'}
          action={
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
              {STATUSES.map((x) => <option key={x} value={x}>{x || 'All'}</option>)}
            </select>
          }
        />
        {loading ? (
          <Spinner />
        ) : error ? (
          <div className="p-5"><ErrorBanner message={error} /></div>
        ) : subs?.length === 0 ? (
          <EmptyState icon={Repeat} title="No subscriptions here" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Product</th>
                <th className="px-5 py-3 font-medium">Cadence</th>
                <th className="px-5 py-3 font-medium">Next order</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {subs?.map((s) => (
                <tr key={s.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-900">{s.customerName ?? s.customerEmail ?? '—'}</div>
                    <div className="text-xs text-slate-400">{s.customerEmail}</div>
                  </td>
                  <td className="px-5 py-3 text-slate-700">
                    {s.quantity}× {s.productTitle}
                    {s.discountPercent > 0 && <span className="ml-1 text-xs text-emerald-600">−{s.discountPercent}%</span>}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{INTERVAL_LABEL[s.interval] ?? s.interval}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">
                    {s.status === 'ACTIVE' ? new Date(s.nextBillingAt).toLocaleDateString() : '—'}
                    {s.cyclesCompleted > 0 && <span className="ml-1 text-slate-400">({s.cyclesCompleted} sent)</span>}
                  </td>
                  <td className="px-5 py-3"><Badge>{s.status}</Badge></td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {s.status === 'ACTIVE' && (
                        <button disabled={busy} onClick={() => act(() => api.subscriptions.setStatus(s.id, 'PAUSED'))} className="rounded-lg border border-slate-300 p-1.5 text-slate-600" title="Pause"><Pause size={13} /></button>
                      )}
                      {s.status === 'PAUSED' && (
                        <button disabled={busy} onClick={() => act(() => api.subscriptions.setStatus(s.id, 'ACTIVE'))} className="rounded-lg border border-slate-300 p-1.5 text-emerald-600" title="Resume"><Play size={13} /></button>
                      )}
                      {s.status !== 'CANCELLED' && (
                        <button disabled={busy} onClick={() => act(() => api.subscriptions.setStatus(s.id, 'CANCELLED'))} className="rounded-lg border border-slate-300 p-1.5 text-rose-600" title="Cancel"><X size={13} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
