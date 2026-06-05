import { useEffect, useState } from 'react';
import { api } from '../api';

const ROLES = ['SUPER_ADMIN', 'SUPPORT', 'BILLING', 'READ_ONLY'];

export default function Staff() {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState({ email: '', name: '', role: 'READ_ONLY' });
  const [error, setError] = useState('');

  function load() {
    api.staff.list().then(setRows).catch((e) => setError(e.message));
  }
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    setError('');
    try {
      await api.staff.create(form);
      setForm({ email: '', name: '', role: 'READ_ONLY' });
      load();
    } catch (e2) {
      setError(e2.message);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Platform staff</h1>

      <form onSubmit={add} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email" type="email"
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="name"
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white" disabled={!form.email}>Add staff</button>
      </form>
      {error && <p className="text-rose-400">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-left text-xs text-slate-400">
            <tr><th className="px-4 py-3">Email</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Role</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody>
            {rows?.map((s) => (
              <tr key={s.id} className="border-t border-slate-800">
                <td className="px-4 py-3">{s.email}</td>
                <td className="px-4 py-3 text-slate-400">{s.name ?? '—'}</td>
                <td className="px-4 py-3">
                  <select value={s.role} onChange={async (e) => { await api.staff.changeRole(s.id, e.target.value); load(); }}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs">
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={async () => { await api.staff.remove(s.id).catch((e) => alert(e.message)); load(); }} className="text-xs text-rose-400 hover:text-rose-300">Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
