import { useState } from 'react';
import { Star, Check, X, MessageSquare } from 'lucide-react';
import { api } from '../api/client';
import { useStores } from '../context/StoreContext';
import { useAsync } from '../hooks/useAsync';
import { Card, CardHeader, Spinner, ErrorBanner, Badge, EmptyState, Button, Input } from '../components/ui';

const STATUSES = ['', 'PENDING', 'APPROVED', 'REJECTED'];

function StarRow({ value }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={13} className={n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} />
      ))}
    </span>
  );
}

export default function Reviews() {
  const { selectedId, selectedStore } = useStores();
  const [status, setStatus] = useState('PENDING');
  const { data: reviews, loading, error, reload } = useAsync(
    () => (selectedId ? api.reviews.list(selectedId, status || undefined) : Promise.resolve([])),
    [selectedId, status],
  );
  const { data: counts, reload: reloadCounts } = useAsync(
    () => (selectedId ? api.reviews.counts(selectedId) : Promise.resolve(null)),
    [selectedId],
  );
  const [replyFor, setReplyFor] = useState(null);
  const [replyText, setReplyText] = useState('');

  async function moderate(id, s) {
    await api.reviews.moderate(id, s);
    reload();
    reloadCounts();
  }
  async function sendReply(id) {
    if (!replyText.trim()) return;
    await api.reviews.reply(id, replyText);
    setReplyFor(null);
    setReplyText('');
    reload();
  }

  if (!selectedId) {
    return (
      <Card>
        <EmptyState icon={Star} title="Select a store">Choose a store to moderate its reviews.</EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Reviews</h1>
        {counts && (
          <div className="flex gap-3 text-xs text-slate-500">
            <span>{counts.PENDING} pending</span>
            <span>{counts.APPROVED} approved</span>
            <span>{counts.REJECTED} rejected</span>
          </div>
        )}
      </div>

      <Card>
        <CardHeader
          title={selectedStore?.name}
          subtitle="Product reviews"
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
        ) : reviews?.length === 0 ? (
          <EmptyState icon={Star} title="No reviews here" />
        ) : (
          <div className="divide-y divide-slate-50">
            {reviews?.map((r) => (
              <div key={r.id} className="px-5 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <StarRow value={r.rating} />
                      <span className="text-sm font-medium text-slate-900">{r.authorName}</span>
                      {r.verified && <Badge>Verified</Badge>}
                      <Badge>{r.status}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">{r.productTitle}</div>
                    {r.title && <div className="mt-1 text-sm font-medium text-slate-900">{r.title}</div>}
                    {r.body && <p className="text-sm text-slate-600">{r.body}</p>}
                    {r.merchantReply && (
                      <div className="mt-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                        <span className="font-medium">Your reply:</span> {r.merchantReply}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {r.status !== 'APPROVED' && (
                      <button onClick={() => moderate(r.id, 'APPROVED')} className="rounded-lg bg-emerald-600 p-1.5 text-white" title="Approve"><Check size={14} /></button>
                    )}
                    {r.status !== 'REJECTED' && (
                      <button onClick={() => moderate(r.id, 'REJECTED')} className="rounded-lg bg-rose-600 p-1.5 text-white" title="Reject"><X size={14} /></button>
                    )}
                    <button onClick={() => { setReplyFor(replyFor === r.id ? null : r.id); setReplyText(r.merchantReply ?? ''); }} className="rounded-lg border border-slate-300 p-1.5 text-slate-600" title="Reply"><MessageSquare size={14} /></button>
                  </div>
                </div>
                {replyFor === r.id && (
                  <div className="mt-3 flex gap-2">
                    <Input value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Public reply to this review…" />
                    <Button onClick={() => sendReply(r.id)} disabled={!replyText.trim()}>Reply</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
