import { Undo2, Check, X, PackageCheck, IndianRupee, Video } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api/client';
import { useStores } from '../context/StoreContext';
import { useAsync } from '../hooks/useAsync';
import { Card, CardHeader, Spinner, ErrorBanner, Badge, EmptyState, Button, Field, Input, formatMoney } from '../components/ui';

const STATUSES = ['', 'REQUESTED', 'APPROVED', 'RECEIVED', 'REFUNDED', 'REJECTED', 'CANCELLED'];
const REASONS = ['DAMAGED', 'WRONG_ITEM', 'NOT_AS_DESCRIBED', 'NO_LONGER_NEEDED', 'OTHER'];
const REASON_LABEL = {
  DAMAGED: 'Damaged',
  WRONG_ITEM: 'Wrong item',
  NOT_AS_DESCRIBED: 'Not as described',
  NO_LONGER_NEEDED: 'No longer needed',
  OTHER: 'Other',
};

export default function Returns() {
  const { selectedId, selectedStore } = useStores();
  const [status, setStatus] = useState('REQUESTED');
  const [busy, setBusy] = useState(null);
  const { data: returns, loading, error, reload } = useAsync(
    () => (selectedId ? api.returns.list(selectedId, status || undefined) : Promise.resolve([])),
    [selectedId, status],
  );
  const { data: counts, reload: reloadCounts } = useAsync(
    () => (selectedId ? api.returns.counts(selectedId) : Promise.resolve(null)),
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
        <EmptyState icon={Undo2} title="Select a store">Choose a store to manage its returns.</EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Returns</h1>
        {counts && (
          <div className="flex gap-3 text-xs text-slate-500">
            <span>{counts.REQUESTED} new</span>
            <span>{counts.APPROVED} approved</span>
            <span>{counts.REFUNDED} refunded</span>
          </div>
        )}
      </div>

      <ReturnPolicyEditor storeId={selectedId} />

      <Card>
        <CardHeader
          title={selectedStore?.name}
          subtitle="Return / refund requests"
          action={
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
              {STATUSES.map((s) => <option key={s} value={s}>{s || 'All'}</option>)}
            </select>
          }
        />
        {loading ? (
          <Spinner />
        ) : error ? (
          <div className="p-5"><ErrorBanner message={error} /></div>
        ) : returns?.length === 0 ? (
          <EmptyState icon={Undo2} title="No returns here" />
        ) : (
          <div className="divide-y divide-slate-50">
            {returns?.map((r) => (
              <div key={r.id} className="px-5 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">RMA #{r.number}</span>
                      <Badge>{r.status}</Badge>
                      <span className="text-xs text-slate-400">Order #{r.orderNumber} · {REASON_LABEL[r.reason] ?? r.reason}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {r.items.map((i) => `${i.quantity}× ${i.title}`).join(', ')}
                    </div>
                    {r.comment && <p className="mt-1 text-sm text-slate-600">“{r.comment}”</p>}
                    <div className="mt-1 flex items-center gap-3 text-xs">
                      <span className="font-medium text-slate-700">Refund {formatMoney(r.refundMinor ?? 0, r.currency)}</span>
                      {r.evidenceVideoUrl && (
                        <a href={r.evidenceVideoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
                          <Video size={12} /> Evidence video
                        </a>
                      )}
                      {r.refundRef && <span className="text-slate-400">ref {r.refundRef}</span>}
                    </div>
                    {r.merchantNote && <div className="mt-1 text-xs text-slate-400">Note: {r.merchantNote}</div>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {r.status === 'REQUESTED' && (
                      <>
                        <button disabled={busy} onClick={() => act(() => api.returns.approve(r.id))} className="rounded-lg bg-emerald-600 p-1.5 text-white" title="Approve"><Check size={14} /></button>
                        <button disabled={busy} onClick={() => act(() => api.returns.reject(r.id))} className="rounded-lg bg-rose-600 p-1.5 text-white" title="Reject"><X size={14} /></button>
                      </>
                    )}
                    {r.status === 'APPROVED' && (
                      <button disabled={busy} onClick={() => act(() => api.returns.receive(r.id))} className="rounded-lg border border-slate-300 p-1.5 text-slate-600" title="Mark received"><PackageCheck size={14} /></button>
                    )}
                    {(r.status === 'APPROVED' || r.status === 'RECEIVED') && (
                      <Button disabled={busy} onClick={() => act(() => api.returns.refund(r.id))}>
                        <IndianRupee size={13} /> Refund
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ReturnPolicyEditor({ storeId }) {
  const { data, loading, reload } = useAsync(() => api.returns.getPolicy(storeId), [storeId]);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  if (loading || !data) return null;
  const p = form ?? data;
  const set = (k, v) => { setForm({ ...p, [k]: v }); setSaved(false); };
  const num = (k, v) => set(k, Number(v));
  const toggleReason = (r) => {
    const cur = new Set(p.eligibleReasons ?? []);
    cur.has(r) ? cur.delete(r) : cur.add(r);
    set('eligibleReasons', [...cur]);
  };
  async function save() {
    setBusy(true);
    try { await api.returns.setPolicy({ storeId, ...p }); setForm(null); setSaved(true); reload(); } finally { setBusy(false); }
  }

  return (
    <Card>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-5 py-4 text-left">
        <div>
          <div className="text-sm font-semibold text-slate-900">Return &amp; cancellation policy</div>
          <div className="text-xs text-slate-400">
            {data.enabled ? `Returns ${data.returnWindowDays}d window` : 'Returns off'} · {data.cancelEnabled ? `Self-cancel ${data.cancelWindowHours}h` : 'Cancel off'} · {data.restockingFeePercent}% restocking{data.autoApprove ? ' · auto-approve' : ''}
          </div>
        </div>
        <span className="text-xs text-indigo-600">{open ? 'Hide' : 'Edit'}</span>
      </button>
      {open && (
        <div className="space-y-5 border-t border-slate-100 p-5">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <Field label="Accept returns" hint="Allow buyers to request returns">
              <Toggle on={p.enabled} onClick={() => set('enabled', !p.enabled)} />
            </Field>
            <Field label="Return window (days)" hint="0 = no time limit">
              <Input type="number" min={0} value={p.returnWindowDays} onChange={(e) => num('returnWindowDays', e.target.value)} />
            </Field>
            <Field label="Restocking fee (%)" hint="Deducted from the refund">
              <Input type="number" min={0} max={100} value={p.restockingFeePercent} onChange={(e) => num('restockingFeePercent', e.target.value)} />
            </Field>
            <Field label="Auto-approve" hint="Approve in-policy requests automatically">
              <Toggle on={p.autoApprove} onClick={() => set('autoApprove', !p.autoApprove)} />
            </Field>
            <Field label="Allow self-cancel" hint="Buyers can cancel their own order">
              <Toggle on={p.cancelEnabled} onClick={() => set('cancelEnabled', !p.cancelEnabled)} />
            </Field>
            <Field label="Cancel window (hours)" hint="0 = no time limit">
              <Input type="number" min={0} value={p.cancelWindowHours} onChange={(e) => num('cancelWindowHours', e.target.value)} />
            </Field>
            <Field label="Cancel after shipment" hint="Allow cancelling once shipped">
              <Toggle on={p.allowCancelAfterShipment} onClick={() => set('allowCancelAfterShipment', !p.allowCancelAfterShipment)} />
            </Field>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-slate-500">Eligible return reasons</div>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((r) => {
                const on = (p.eligibleReasons ?? []).includes(r);
                return (
                  <button key={r} onClick={() => toggleReason(r)} className={`rounded-full px-3 py-1 text-xs font-medium ${on ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                    {REASON_LABEL[r]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={save} loading={busy} disabled={!form}>Save policy</Button>
            {saved && <span className="text-sm text-emerald-600">Saved.</span>}
          </div>
        </div>
      )}
    </Card>
  );
}

function Toggle({ on, onClick }) {
  return (
    <button onClick={onClick} className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${on ? 'bg-indigo-600' : 'bg-slate-300'}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${on ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}
