import { useEffect, useState } from 'react';
import { Wallet, TrendingUp, Building2, CalendarClock } from 'lucide-react';
import { api, money } from '../api';

function Kpi({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-center gap-2 text-xs text-slate-400"><Icon size={14} /> {label}</div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.dashboard().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-rose-400">{error}</p>;
  if (!data) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">{data.partner.name}</h1>
        <p className="text-sm text-slate-400">Earnings on client GMV (last 30 days) · {data.partner.commissionPercent}% commission</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={Wallet} label="Your earnings" value={money(data.earningsMinor)} sub={`${data.partner.commissionPercent}% of GMV`} />
        <Kpi icon={TrendingUp} label="Client GMV" value={money(data.gmvMinor)} sub={`${data.orders} orders`} />
        <Kpi icon={Building2} label="Clients" value={`${data.activeClients}/${data.clientCount}`} sub={`${data.stores} stores`} />
        <Kpi icon={CalendarClock} label="Recurring (MRR)" value={money(data.mrrMinor)} sub={`${data.upcomingRenewals.length} renewing soon`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 px-5 py-3 text-sm font-medium text-white">Top clients by GMV</div>
          {data.topClients.length === 0 ? (
            <div className="p-5 text-sm text-slate-500">No sales yet.</div>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {data.topClients.map((c) => (
                  <tr key={c.clientId} className="border-b border-slate-800/50 last:border-0">
                    <td className="px-5 py-3 text-slate-200">{c.name}</td>
                    <td className="px-5 py-3 text-right text-slate-300">{money(c.gmvMinor)}</td>
                    <td className="px-5 py-3 text-right text-emerald-400">+{money(c.earningsMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 px-5 py-3 text-sm font-medium text-white">Upcoming renewals</div>
          {data.upcomingRenewals.length === 0 ? (
            <div className="p-5 text-sm text-slate-500">Nothing due in the next 30 days.</div>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {data.upcomingRenewals.map((r) => (
                  <tr key={r.clientId} className="border-b border-slate-800/50 last:border-0">
                    <td className="px-5 py-3 text-slate-200">{r.name}</td>
                    <td className="px-5 py-3 text-right text-slate-300">{money(r.monthlyFeeMinor)}</td>
                    <td className={`px-5 py-3 text-right ${r.overdue ? 'text-rose-400' : 'text-slate-400'}`}>
                      {new Date(r.renewsAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
