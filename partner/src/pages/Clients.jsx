import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { api, getToken, money } from '../api';

const ADMIN_URL = import.meta.env.VITE_ADMIN_URL ?? 'http://localhost:5173';
const ACCESS_BADGE = {
  MANAGE: 'text-emerald-300 bg-emerald-500/20',
  VIEW: 'text-amber-300 bg-amber-500/20',
  NONE: 'text-slate-400 bg-slate-700',
};

export default function Clients() {
  const [clients, setClients] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.clients().then(setClients).catch((e) => setError(e.message));
  }, []);

  // Deep-link into the merchant admin console to manage this client's store.
  function manage(c) {
    const q = new URLSearchParams({ partnerToken: getToken(), client: c.tenantId, clientName: c.name });
    window.open(`${ADMIN_URL}/?${q.toString()}`, '_blank', 'noopener');
  }

  if (error) return <p className="text-rose-400">{error}</p>;
  if (!clients) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-white">Clients</h1>
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-xs text-slate-400">
              <th className="px-5 py-3 font-medium">Client</th>
              <th className="px-5 py-3 font-medium">Stores</th>
              <th className="px-5 py-3 font-medium">GMV (30d)</th>
              <th className="px-5 py-3 font-medium">Orders</th>
              <th className="px-5 py-3 font-medium">Your earnings</th>
              <th className="px-5 py-3 font-medium">Plan fee</th>
              <th className="px-5 py-3 font-medium">Renews</th>
              <th className="px-5 py-3 font-medium">Access</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr><td colSpan={9} className="px-5 py-8 text-center text-slate-500">No clients assigned yet.</td></tr>
            ) : (
              clients.map((c) => (
                <tr key={c.clientId} className="border-b border-slate-800/50 last:border-0">
                  <td className="px-5 py-3">
                    <span className="text-slate-100">{c.name}</span>
                    {c.status !== 'ACTIVE' && <span className="ml-2 rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] text-rose-300">{c.status}</span>}
                  </td>
                  <td className="px-5 py-3 text-slate-400">{c.stores}</td>
                  <td className="px-5 py-3 text-slate-300">{money(c.gmvMinor)}</td>
                  <td className="px-5 py-3 text-slate-400">{c.orders}</td>
                  <td className="px-5 py-3 text-emerald-400">{money(c.earningsMinor)}</td>
                  <td className="px-5 py-3 text-slate-300">{c.monthlyFeeMinor ? money(c.monthlyFeeMinor) : '—'}</td>
                  <td className="px-5 py-3 text-slate-400">{c.renewsAt ? new Date(c.renewsAt).toLocaleDateString() : '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${ACCESS_BADGE[c.accessLevel] ?? ACCESS_BADGE.NONE}`}>{c.accessLevel}</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    {c.accessLevel !== 'NONE' && (
                      <button onClick={() => manage(c)} className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
                        Manage <ExternalLink size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
