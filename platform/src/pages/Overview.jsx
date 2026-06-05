import { useEffect, useState } from 'react';
import { api } from '../api';

const money = (m) => {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format((m ?? 0) / 100);
  } catch {
    return `₹${((m ?? 0) / 100).toFixed(0)}`;
  }
};

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

// Lightweight inline bar chart (avoids extra chart deps in this console).
function MiniBars({ data, valueKey, color = 'bg-indigo-500' }) {
  const max = Math.max(1, ...data.map((d) => d[valueKey]));
  return (
    <div className="flex h-32 items-end gap-0.5">
      {data.map((d, i) => (
        <div key={i} className="flex-1" title={`${d.date}: ${d[valueKey]}`}>
          <div className={`${color} rounded-t`} style={{ height: `${(d[valueKey] / max) * 100}%`, minHeight: d[valueKey] ? 2 : 0 }} />
        </div>
      ))}
    </div>
  );
}

export default function Overview() {
  const [days, setDays] = useState(30);
  const from = new Date(Date.now() - days * 86400000).toISOString();
  const [ov, setOv] = useState(null);
  const [top, setTop] = useState(null);
  const [growth, setGrowth] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    Promise.all([api.analytics.overview(from), api.analytics.topMerchants(from, 5), api.analytics.growth(from, days > 31 ? 'week' : 'day')])
      .then(([o, t, g]) => { setOv(o); setTop(t); setGrowth(g); })
      .catch((e) => setError(e.message));
  }, [from, days]);

  if (error) return <p className="text-rose-400">{error}</p>;
  if (!ov) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Platform overview</h1>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="GMV (paid)" value={money(ov.gmvMinor)} sub={`${ov.paidOrders} paid orders`} />
        <Stat label="Merchants" value={ov.tenants} sub={`${ov.activeTenants} active · ${ov.suspendedTenants} suspended`} />
        <Stat label="Stores" value={ov.stores} sub={`${ov.activeStores} active`} />
        <Stat label="New merchants" value={ov.newTenants} sub="in period" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-3 text-sm font-medium text-slate-300">GMV over time</div>
          {growth && <MiniBars data={growth.gmv} valueKey="gmvMinor" color="bg-emerald-500" />}
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-3 text-sm font-medium text-slate-300">New merchants</div>
          {growth && <MiniBars data={growth.newTenants} valueKey="count" />}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800">
        <div className="border-b border-slate-800 bg-slate-900 px-5 py-3 text-sm font-medium text-slate-300">Top merchants by GMV</div>
        <table className="w-full text-sm">
          <tbody>
            {top?.length ? top.map((m) => (
              <tr key={m.tenantId} className="border-t border-slate-800">
                <td className="px-5 py-3 font-medium text-slate-200">{m.name}</td>
                <td className="px-5 py-3 text-right text-slate-400">{m.orders} orders</td>
                <td className="px-5 py-3 text-right font-medium text-emerald-300">{money(m.gmvMinor)}</td>
              </tr>
            )) : <tr><td className="px-5 py-6 text-center text-slate-500">No sales in this period.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
