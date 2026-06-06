import { Undo2, Check, X, PackageCheck, IndianRupee, Video } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api/client';
import { useStores } from '../context/StoreContext';
import { useAsync } from '../hooks/useAsync';
import { Card, CardHeader, Spinner, ErrorBanner, Badge, EmptyState, Button, formatMoney } from '../components/ui';

const STATUSES = ['', 'REQUESTED', 'APPROVED', 'RECEIVED', 'REFUNDED', 'REJECTED', 'CANCELLED'];
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
