import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MessageSquare, X } from 'lucide-react';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Card, CardHeader, Spinner, ErrorBanner, Badge, Button, Input, formatMoney } from '../components/ui';

const SEGMENT_BADGE = {
  VIP: 'bg-amber-100 text-amber-800',
  REPEAT: 'bg-indigo-100 text-indigo-700',
  ONE_TIME: 'bg-slate-100 text-slate-600',
  NEW: 'bg-emerald-100 text-emerald-700',
  AT_RISK: 'bg-orange-100 text-orange-700',
  LAPSED: 'bg-rose-100 text-rose-700',
};
const TEMP_BADGE = { HOT: 'bg-rose-100 text-rose-700', WARM: 'bg-amber-100 text-amber-800', COLD: 'bg-sky-100 text-sky-700' };
const COHORT_BADGE = { BEHAVIORAL: 'bg-indigo-100 text-indigo-700', ACQUISITION: 'bg-emerald-100 text-emerald-700' };

function Metric({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-bold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

export default function CustomerDetail() {
  const { id } = useParams();
  const { data, loading, error, reload } = useAsync(() => api.customers.profile(id), [id]);
  const { data: cohorts } = useAsync(() => api.customers.cohorts(id), [id]);
  const { data: recs } = useAsync(() => api.customers.recommendations(id), [id]);
  const [tagInput, setTagInput] = useState('');
  const [notes, setNotes] = useState(null);
  const [savingNotes, setSavingNotes] = useState(false);

  async function addTag(e) {
    e.preventDefault();
    const t = tagInput.trim();
    if (!t) return;
    const tags = Array.from(new Set([...(data.customer.tags ?? []), t]));
    await api.customers.update(id, { tags });
    setTagInput('');
    reload();
  }
  async function removeTag(t) {
    const tags = (data.customer.tags ?? []).filter((x) => x !== t);
    await api.customers.update(id, { tags });
    reload();
  }
  async function saveNotes() {
    setSavingNotes(true);
    try {
      await api.customers.update(id, { notes });
      setNotes(null);
      reload();
    } finally {
      setSavingNotes(false);
    }
  }

  if (loading) return <Spinner />;
  if (error) return <div className="p-5"><ErrorBanner message={error} /></div>;
  if (!data) return null;

  const { customer, segment, metrics, loyalty, subscriptions, reviews, returns, support, recentOrders } = data;
  const cur = metrics.currency;
  const notesVal = notes ?? customer.notes ?? '';

  return (
    <div className="space-y-6">
      <Link to="/customers" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={14} /> Back to customers
      </Link>

      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{customer.name ?? customer.email ?? 'Customer'}</h1>
          <div className="text-sm text-slate-500">{customer.email} {customer.phone ? `· ${customer.phone}` : ''}</div>
        </div>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${SEGMENT_BADGE[segment]}`}>{segment}</span>
        {cohorts && <span className={`rounded px-2 py-0.5 text-xs font-medium ${TEMP_BADGE[cohorts.temperature]}`}>{cohorts.temperature}</span>}
        {cohorts?.acquisition?.source && (
          <span className="text-xs text-slate-400">
            via {cohorts.acquisition.source}{cohorts.acquisition.campaign ? ` · ${cohorts.acquisition.campaign}` : ''}{cohorts.acquisition.term ? ` · "${cohorts.acquisition.term}"` : ''}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Lifetime value" value={formatMoney(metrics.lifetimeValueMinor, cur)} sub={`${metrics.paidOrders} paid orders`} />
        <Metric label="Avg order value" value={formatMoney(metrics.aovMinor, cur)} />
        <Metric label="Last order" value={metrics.lastOrderAt ? new Date(metrics.lastOrderAt).toLocaleDateString() : '—'} sub={metrics.daysSinceLastOrder != null ? `${metrics.daysSinceLastOrder} days ago` : ''} />
        <Metric label="Customer since" value={new Date(customer.createdAt).toLocaleDateString()} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="Loyalty" value={loyalty ? `${loyalty.pointsBalance} pts` : '—'} sub={loyalty?.tier ?? 'No account'} />
        <Metric label="Subscriptions" value={`${subscriptions.active}`} sub={`${subscriptions.total} total`} />
        <Metric label="Reviews" value={reviews} />
        <Metric label="Returns" value={returns} />
        <Metric label="Open support" value={support.open} />
      </div>

      {(cohorts?.cohorts?.length > 0 || recs?.recommendations?.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Cohorts" subtitle="ML micro-cohorts this customer belongs to (weighted)" />
            <div className="flex flex-wrap gap-2 p-5">
              {(cohorts?.cohorts ?? []).map((c) => (
                <span key={c.key} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${COHORT_BADGE[c.kind]}`}>
                  {c.label}<span className="opacity-60">·{Math.round(c.weight * 100)}%</span>
                </span>
              ))}
              {(!cohorts?.cohorts || cohorts.cohorts.length === 0) && <span className="text-sm text-slate-400">No cohorts yet — recompute on the Cohorts page.</span>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Recommended next purchases" subtitle="What peers in their cohorts bought" />
            {recs?.recommendations?.length ? (
              <table className="w-full text-sm">
                <tbody>
                  {recs.recommendations.map((r) => (
                    <tr key={r.productId} className="border-b border-slate-50 last:border-0">
                      <td className="px-5 py-3 text-slate-800">{r.title}</td>
                      <td className="px-5 py-3 text-right font-medium text-slate-900">{r.priceMinor != null ? formatMoney(r.priceMinor, r.currency) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-5 text-sm text-slate-400">No recommendations yet.</div>
            )}
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Recent orders" />
          {recentOrders.length === 0 ? (
            <div className="p-5 text-sm text-slate-400">No orders yet.</div>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-3 font-medium text-slate-900">#{o.number}</td>
                    <td className="px-5 py-3"><Badge>{o.status}</Badge></td>
                    <td className="px-5 py-3 text-slate-500">{new Date(o.createdAt).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-right font-medium text-slate-900">{formatMoney(o.totalMinor, o.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <CardHeader title="CRM" subtitle="Tags & notes" />
          <div className="space-y-4 p-5">
            <div>
              <div className="mb-1 text-xs font-medium text-slate-500">Tags</div>
              <div className="flex flex-wrap gap-1.5">
                {(customer.tags ?? []).map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                    {t}
                    <button onClick={() => removeTag(t)} className="text-slate-400 hover:text-rose-600"><X size={11} /></button>
                  </span>
                ))}
                {(customer.tags ?? []).length === 0 && <span className="text-xs text-slate-400">No tags</span>}
              </div>
              <form onSubmit={addTag} className="mt-2 flex gap-2">
                <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Add a tag (e.g. vip)" />
                <Button type="submit" variant="secondary">Add</Button>
              </form>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-slate-500">Notes</div>
              <textarea
                value={notesVal}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Internal notes about this customer…"
              />
              {notes !== null && notes !== (customer.notes ?? '') && (
                <div className="mt-2 flex justify-end">
                  <Button onClick={saveNotes} loading={savingNotes}>Save notes</Button>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {support.recent.length > 0 && (
        <Card>
          <CardHeader title="Support" subtitle="Recent conversations" />
          <div className="divide-y divide-slate-50">
            {support.recent.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="flex items-center gap-2 text-slate-600"><MessageSquare size={14} /> Conversation</span>
                <span className="flex items-center gap-2"><Badge>{s.status}</Badge><span className="text-xs text-slate-400">{new Date(s.updatedAt).toLocaleDateString()}</span></span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
