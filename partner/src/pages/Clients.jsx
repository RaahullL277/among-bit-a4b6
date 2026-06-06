import { useEffect, useState } from 'react';
import { ExternalLink, Plus, Pencil, Copy } from 'lucide-react';
import { api, getToken, money } from '../api';

const ADMIN_URL = import.meta.env.VITE_ADMIN_URL ?? 'http://localhost:5173';
const ACCESS_BADGE = {
  MANAGE: 'text-emerald-300 bg-emerald-500/20',
  VIEW: 'text-amber-300 bg-amber-500/20',
  NONE: 'text-slate-400 bg-slate-700',
};

const field = 'w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white';

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-800 p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-base font-semibold text-white">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function toMinor(rupees) {
  const n = parseFloat(rupees);
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}

export default function Clients() {
  const [clients, setClients] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [created, setCreated] = useState(null); // new-workspace credentials to hand off

  function load() {
    api.clients().then(setClients).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  function manage(c) {
    const q = new URLSearchParams({ partnerToken: getToken(), client: c.tenantId, clientName: c.name });
    window.open(`${ADMIN_URL}/?${q.toString()}`, '_blank', 'noopener');
  }

  if (error) return <p className="text-rose-400">{error}</p>;
  if (!clients) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Clients</h1>
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500">
          <Plus size={15} /> New client
        </button>
      </div>

      {created && (
        <div className="rounded-2xl border border-emerald-700 bg-emerald-500/10 p-4 text-sm">
          <div className="font-medium text-emerald-300">Client "{created.name}" created.</div>
          <div className="mt-1 text-slate-300">Owner login (magic link): <span className="font-mono">{created.ownerEmail}</span></div>
          <div className="mt-1 flex items-center gap-2 text-slate-300">
            API key: <code className="truncate rounded bg-slate-900 px-2 py-1 font-mono text-xs">{created.apiKey}</code>
            <button onClick={() => navigator.clipboard?.writeText(created.apiKey)} className="text-indigo-400"><Copy size={13} /></button>
          </div>
          <button onClick={() => setCreated(null)} className="mt-2 text-xs text-slate-400 hover:text-white">Dismiss</button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-xs text-slate-400">
              <th className="px-5 py-3 font-medium">Client</th>
              <th className="px-5 py-3 font-medium">GMV (30d)</th>
              <th className="px-5 py-3 font-medium">Your earnings</th>
              <th className="px-5 py-3 font-medium">Plan fee</th>
              <th className="px-5 py-3 font-medium">Renews</th>
              <th className="px-5 py-3 font-medium">Access</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-500">No clients yet — add your first with "New client".</td></tr>
            ) : (
              clients.map((c) => (
                <tr key={c.clientId} className="border-b border-slate-800/50 last:border-0">
                  <td className="px-5 py-3">
                    <span className="text-slate-100">{c.name}</span>
                    {c.status !== 'ACTIVE' && <span className="ml-2 rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] text-rose-300">{c.status}</span>}
                    <div className="text-xs text-slate-500">{c.stores} store(s) · {c.orders} orders</div>
                  </td>
                  <td className="px-5 py-3 text-slate-300">{money(c.gmvMinor)}</td>
                  <td className="px-5 py-3 text-emerald-400">{money(c.earningsMinor)}</td>
                  <td className="px-5 py-3 text-slate-300">{c.monthlyFeeMinor ? money(c.monthlyFeeMinor) : '—'}</td>
                  <td className="px-5 py-3 text-slate-400">{c.renewsAt ? new Date(c.renewsAt).toLocaleDateString() : '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${ACCESS_BADGE[c.accessLevel] ?? ACCESS_BADGE.NONE}`}>{c.accessLevel}</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => setEditing(c)} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white"><Pencil size={12} /> Plan</button>
                      {c.accessLevel !== 'NONE' && (
                        <button onClick={() => manage(c)} className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
                          Manage <ExternalLink size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {creating && <CreateClient onClose={() => setCreating(false)} onCreated={(r) => { setCreated(r); setCreating(false); load(); }} />}
      {editing && <EditPlan client={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function CreateClient({ onClose, onCreated }) {
  const [f, setF] = useState({ businessName: '', ownerEmail: '', fee: '', renewsAt: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const res = await api.createClient({
        businessName: f.businessName,
        ownerEmail: f.ownerEmail,
        monthlyFeeMinor: toMinor(f.fee),
        renewsAt: f.renewsAt || undefined,
      });
      onCreated(res);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Onboard a new client" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <input className={field} placeholder="Client business name" value={f.businessName} onChange={(e) => setF({ ...f, businessName: e.target.value })} required />
        <input className={field} type="email" placeholder="Owner email (magic-link login)" value={f.ownerEmail} onChange={(e) => setF({ ...f, ownerEmail: e.target.value })} required />
        <div className="grid grid-cols-2 gap-2">
          <input className={field} type="number" placeholder="Plan fee (₹/mo)" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} />
          <input className={field} type="date" value={f.renewsAt} onChange={(e) => setF({ ...f, renewsAt: e.target.value })} />
        </div>
        {err && <p className="text-sm text-rose-400">{err}</p>}
        <p className="text-xs text-slate-400">This creates a fresh store workspace and links it to you with full (MANAGE) access. The client can change your access any time.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300">Cancel</button>
          <button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Creating…' : 'Create client'}</button>
        </div>
      </form>
    </Modal>
  );
}

function EditPlan({ client, onClose, onSaved }) {
  const [fee, setFee] = useState(client.monthlyFeeMinor ? (client.monthlyFeeMinor / 100).toString() : '');
  const [renewsAt, setRenewsAt] = useState(client.renewsAt ? new Date(client.renewsAt).toISOString().slice(0, 10) : '');
  const [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.updateClient(client.clientId, { monthlyFeeMinor: toMinor(fee) ?? 0, renewsAt: renewsAt || null });
      onSaved();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`Edit plan — ${client.name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <label className="block text-xs text-slate-400">Monthly plan fee (₹)
          <input className={field + ' mt-1'} type="number" value={fee} onChange={(e) => setFee(e.target.value)} />
        </label>
        <label className="block text-xs text-slate-400">Next renewal date
          <input className={field + ' mt-1'} type="date" value={renewsAt} onChange={(e) => setRenewsAt(e.target.value)} />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300">Cancel</button>
          <button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save plan'}</button>
        </div>
      </form>
    </Modal>
  );
}
