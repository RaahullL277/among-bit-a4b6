import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

function Pill({ status }) {
  const cls = status === 'SUSPENDED' ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300';
  return <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{status}</span>;
}

export default function Tenants() {
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  function load() {
    api.tenants.list(search, status).then(setRows).catch((e) => setError(e.message));
  }
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status]);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Tenants</h1>
      <div className="flex gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search merchants…"
          className="w-64 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm">
          <option value="">All</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
      </div>
      {error && <p className="text-rose-400">{error}</p>}
      <div className="overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-left text-xs text-slate-400">
            <tr>
              <th className="px-4 py-3">Merchant</th>
              <th className="px-4 py-3">Stores</th>
              <th className="px-4 py-3">Members</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((t) => (
              <tr key={t.id} className="border-t border-slate-800 hover:bg-slate-900/50">
                <td className="px-4 py-3">
                  <Link to={`/tenants/${t.id}`} className="font-medium text-indigo-300 hover:underline">{t.name}</Link>
                </td>
                <td className="px-4 py-3 text-slate-400">{t.stores}</td>
                <td className="px-4 py-3 text-slate-400">{t.members}</td>
                <td className="px-4 py-3 text-slate-400">{new Date(t.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3"><Pill status={t.status} /></td>
              </tr>
            ))}
            {rows && rows.length === 0 && (
              <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-500">No tenants.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
