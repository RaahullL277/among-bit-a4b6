import { useState } from 'react';
import { Sparkles, RefreshCw, Users, Clock } from 'lucide-react';
import { api } from '../api/client';
import { useStores } from '../context/StoreContext';
import { useAsync } from '../hooks/useAsync';
import { Button, Card, CardHeader, Spinner, ErrorBanner, Badge, EmptyState, formatMoney } from '../components/ui';

const KIND_BADGE = { BEHAVIORAL: 'bg-indigo-100 text-indigo-700', ACQUISITION: 'bg-emerald-100 text-emerald-700', SEARCH_INTENT: 'bg-amber-100 text-amber-700' };
const CADENCE_BADGE = { DAILY: 'bg-rose-100 text-rose-700', WEEKLY: 'bg-amber-100 text-amber-700', MONTHLY: 'bg-slate-100 text-slate-600' };
const CADENCE_LABEL = { DAILY: 'Nightly', WEEKLY: 'Weekly', MONTHLY: 'Monthly' };

function Field({ label, value, highlight }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-sm font-medium ${highlight ? 'text-emerald-600' : 'text-slate-900'}`}>{value}</div>
    </div>
  );
}

export default function Cohorts() {
  const { selectedId, selectedStore } = useStores();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const { data: cohorts, loading, error, reload } = useAsync(
    () => (selectedId ? api.cohorts.list(selectedId) : Promise.resolve([])),
    [selectedId],
  );
  const { data: schedule, reload: reloadSchedule } = useAsync(
    () => (selectedId ? api.cohorts.schedule(selectedId) : Promise.resolve(null)),
    [selectedId],
  );

  async function recompute() {
    setBusy(true);
    setMsg('');
    try {
      const r = await api.cohorts.recompute(selectedId);
      setMsg(`Recomputed ${r.cohorts} cohorts (${r.behavioral} behavioural, ${r.acquisition} acquisition, ${r.searchIntent ?? 0} search-intent) across ${r.customers} customers.`);
      reload();
      reloadSchedule();
    } finally {
      setBusy(false);
    }
  }

  if (!selectedId) {
    return (
      <Card>
        <EmptyState icon={Sparkles} title="Select a store">Choose a store to view its customer cohorts.</EmptyState>
      </Card>
    );
  }

  const behavioral = (cohorts ?? []).filter((c) => c.kind === 'BEHAVIORAL');
  const acquisition = (cohorts ?? []).filter((c) => c.kind === 'ACQUISITION' || c.kind === 'SEARCH_INTENT');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Cohort intelligence</h1>
          <p className="text-sm text-slate-500">ML micro-cohorts (fuzzy c-means) from behaviour + Meta/Google attribution. A customer can be in several.</p>
        </div>
        <Button onClick={recompute} loading={busy}><RefreshCw size={14} /> Recompute</Button>
      </div>

      {schedule && (
        <Card>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Clock size={15} className="text-slate-400" />
              <span>Auto-refresh</span>
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${CADENCE_BADGE[schedule.cadence]}`}>{CADENCE_LABEL[schedule.cadence]}</span>
            </div>
            <Field label="Avg daily visitors" value={schedule.avgDailyVisitors.toLocaleString('en-IN')} />
            <Field label="Last recomputed" value={schedule.lastRecomputedAt ? new Date(schedule.lastRecomputedAt).toLocaleString('en-IN') : '—'} />
            <Field label={schedule.dueNow ? 'Next refresh' : 'Next refresh'} value={schedule.dueNow ? 'Due now' : schedule.nextDueAt ? new Date(schedule.nextDueAt).toLocaleString('en-IN') : '—'} highlight={schedule.dueNow} />
          </div>
          <div className="border-t border-slate-50 px-5 py-2 text-xs text-slate-400">
            Cadence is automatic: nightly for stores over 10,000 daily visitors, weekly for 1,000–10,000, monthly under 1,000. “Recompute” runs it now.
          </div>
        </Card>
      )}

      {msg && <div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{msg}</div>}

      {loading ? (
        <Spinner />
      ) : error ? (
        <Card><div className="p-5"><ErrorBanner message={error} /></div></Card>
      ) : (cohorts ?? []).length === 0 ? (
        <Card><EmptyState icon={Sparkles} title="No cohorts yet">Run “Recompute” once customers have browsed and bought.</EmptyState></Card>
      ) : (
        <>
          <Card>
            <CardHeader title="Behavioural micro-cohorts" subtitle={`${behavioral.length} cohorts · ${selectedStore?.name}`} />
            <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2 lg:grid-cols-3">
              {behavioral.map((c) => (
                <div key={c.key} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">{c.label}</span>
                    <Badge>{c.size}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-500">
                    {Object.entries(c.signature?.channels ?? {}).map(([ch, n]) => (
                      <span key={ch} className="rounded bg-slate-100 px-1.5 py-0.5">{ch}: {n}</span>
                    ))}
                  </div>
                  <div className="mt-2 text-xs text-slate-400">
                    avg {c.signature?.avgOrders ?? 0} orders · {formatMoney(c.signature?.avgSpendMinor ?? 0)} spend · {c.signature?.avgViews ?? 0} views · {c.signature?.avgCarts ?? 0} carts
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Acquisition & intent cohorts" subtitle="By Meta campaign / Google term, and by on-site search" />
            {acquisition.length === 0 ? (
              <EmptyState icon={Users} title="No acquisition or search cohorts">Add utm_source / utm_campaign / utm_term to your links, and shoppers’ on-site searches will form intent cohorts.</EmptyState>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {acquisition.map((c) => (
                    <tr key={c.key} className="border-b border-slate-50 last:border-0">
                      <td className="px-5 py-3 font-medium text-slate-900">{c.label}</td>
                      <td className="px-5 py-3"><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${KIND_BADGE[c.kind]}`}>{c.kind}</span></td>
                      <td className="px-5 py-3 text-right text-slate-600">{c.size} customers</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
