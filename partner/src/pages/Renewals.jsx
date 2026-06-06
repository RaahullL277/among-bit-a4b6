import { useEffect, useState } from 'react';
import { api, money } from '../api';

export default function Renewals() {
  const [days, setDays] = useState(60);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.renewals(days).then(setRows).catch((e) => setError(e.message));
  }, [days]);

  if (error) return <p className="text-rose-400">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Upcoming renewals</h1>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200">
          <option value={30}>Next 30 days</option>
          <option value={60}>Next 60 days</option>
          <option value={90}>Next 90 days</option>
        </select>
      </div>
      {!rows ? (
        <p className="text-slate-400">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs text-slate-400">
                <th className="px-5 py-3 font-medium">Client</th>
                <th className="px-5 py-3 font-medium">Plan fee</th>
                <th className="px-5 py-3 font-medium">Renews</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-500">No renewals in this window.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.clientId} className="border-b border-slate-800/50 last:border-0">
                    <td className="px-5 py-3 text-slate-100">{r.name}</td>
                    <td className="px-5 py-3 text-slate-300">{money(r.monthlyFeeMinor)}</td>
                    <td className="px-5 py-3 text-slate-400">{new Date(r.renewsAt).toLocaleDateString()}</td>
                    <td className="px-5 py-3">
                      {r.overdue ? <span className="rounded bg-rose-500/20 px-2 py-0.5 text-xs text-rose-300">Overdue</span> : <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">Upcoming</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
