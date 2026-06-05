import { useEffect, useState } from 'react';
import { api } from '../api';

export default function Audit() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.audit(100).then(setRows).catch((e) => setError(e.message)); }, []);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Audit log</h1>
      {error && <p className="text-rose-400">{error}</p>}
      <div className="overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-left text-xs text-slate-400">
            <tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Target</th></tr>
          </thead>
          <tbody>
            {rows?.map((a) => (
              <tr key={a.id} className="border-t border-slate-800">
                <td className="px-4 py-3 text-slate-400">{new Date(a.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3 text-slate-300">{a.actorEmail}</td>
                <td className="px-4 py-3"><code className="text-indigo-300">{a.action}</code></td>
                <td className="px-4 py-3 text-slate-500">{a.targetType ? `${a.targetType} ${a.metadata?.name ?? a.targetId ?? ''}` : '—'}</td>
              </tr>
            ))}
            {rows && rows.length === 0 && <tr><td colSpan="4" className="px-4 py-8 text-center text-slate-500">No activity yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
