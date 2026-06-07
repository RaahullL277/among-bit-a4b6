import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, MapPin, LogOut, Plus, Trash2, Star } from 'lucide-react';
import { api, money, STORE_ID } from '../api';
import { useAccount } from '../account';

export default function Account() {
  const { customer, ready, signedIn } = useAccount();
  if (!ready) return <p className="text-stone-500">Loading…</p>;
  return signedIn ? <Dashboard customer={customer} /> : <Login />;
}

// --- Sign in (email OTP) ----------------------------------------------------

function Login() {
  const { signIn } = useAccount();
  const [step, setStep] = useState('email'); // 'email' | 'code'
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const request = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true); setMsg('');
    try {
      const res = await api.account.requestCode(STORE_ID, email.trim());
      setStep('code');
      // Dev convenience: prefill the code when the server returns it (no email provider configured).
      if (res?.devCode) { setCode(res.devCode); setMsg(`Dev code: ${res.devCode}`); }
      else setMsg('We emailed you a 6-digit code.');
    } catch (err) { setMsg(err.message); } finally { setBusy(false); }
  };

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      const res = await api.account.verifyCode(STORE_ID, { email: email.trim(), code: code.trim(), name: name.trim() || undefined });
      signIn(res.token, res.customer);
    } catch (err) { setMsg(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-xl font-semibold text-stone-900">Your account</h1>
      <p className="mt-1 text-sm text-stone-500">Sign in with your email to see orders and saved addresses.</p>

      {step === 'email' ? (
        <form onSubmit={request} className="mt-5 space-y-3">
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" autoFocus
          />
          <input
            value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)"
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
          <button disabled={busy || !email.trim()} className="w-full rounded-lg bg-stone-900 px-4 py-2 font-medium text-white disabled:opacity-50">
            {busy ? 'Sending…' : 'Send login code'}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-5 space-y-3">
          <input
            inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code"
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-center text-lg tracking-widest" autoFocus
          />
          <button disabled={busy || code.trim().length < 4} className="w-full rounded-lg bg-stone-900 px-4 py-2 font-medium text-white disabled:opacity-50">
            {busy ? 'Verifying…' : 'Sign in'}
          </button>
          <button type="button" onClick={() => { setStep('email'); setMsg(''); }} className="w-full text-center text-sm text-stone-500 hover:text-stone-800">
            Use a different email
          </button>
        </form>
      )}
      {msg && <p className="mt-3 text-sm text-stone-500">{msg}</p>}
    </div>
  );
}

// --- Signed-in dashboard ----------------------------------------------------

function Dashboard({ customer }) {
  const { signOut } = useAccount();
  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Hi{customer?.name ? `, ${customer.name}` : ''}</h1>
          <p className="text-sm text-stone-500">{customer?.email}</p>
        </div>
        <button onClick={signOut} className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800">
          <LogOut size={15} /> Sign out
        </button>
      </div>

      <Orders />
      <Addresses />
    </div>
  );
}

function Orders() {
  const [orders, setOrders] = useState(null);
  useEffect(() => { api.account.orders().then(setOrders).catch(() => setOrders([])); }, []);

  return (
    <section className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-800"><Package size={16} /> Order history</h2>
      {orders === null ? (
        <p className="text-sm text-stone-400">Loading…</p>
      ) : !orders.length ? (
        <p className="text-sm text-stone-500">No orders yet. <Link to="/shop" className="underline">Start shopping</Link>.</p>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.number} className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium text-stone-900">Order #{o.number}</span>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">{o.status}</span>
              </div>
              <div className="mt-1 text-sm text-stone-500">
                {new Date(o.placedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · {o.itemCount} item{o.itemCount === 1 ? '' : 's'} · {money(o.totalMinor, o.currency)}
              </div>
              <div className="mt-1 line-clamp-1 text-xs text-stone-400">{o.items.map((i) => `${i.quantity}× ${i.title}`).join(', ')}</div>
              {o.shipment?.trackingUrl && (
                <a href={o.shipment.trackingUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-stone-600 underline">Track shipment ({o.shipment.status})</a>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Addresses() {
  const [addresses, setAddresses] = useState(null);
  const [adding, setAdding] = useState(false);
  const blank = { name: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '' };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);

  const load = () => api.account.addresses().then(setAddresses).catch(() => setAddresses([]));
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!form.line1.trim()) return;
    setBusy(true);
    try { await api.account.addAddress(form); setForm(blank); setAdding(false); await load(); }
    finally { setBusy(false); }
  };
  const remove = async (id) => { await api.account.removeAddress(id); await load(); };
  const makeDefault = async (id) => { await api.account.updateAddress(id, { isDefault: true }); await load(); };

  const f = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  return (
    <section className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-800"><MapPin size={16} /> Saved addresses</h2>
      {addresses === null ? (
        <p className="text-sm text-stone-400">Loading…</p>
      ) : (
        <div className="space-y-3">
          {addresses.map((a) => (
            <div key={a.id} className="flex items-start justify-between rounded-xl border border-stone-200 bg-white p-4">
              <div className="text-sm text-stone-700">
                <div className="font-medium text-stone-900">
                  {a.name || 'Address'}
                  {a.isDefault && <span className="ml-2 inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700"><Star size={10} /> Default</span>}
                </div>
                <div className="text-stone-500">{[a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ')}</div>
                {a.phone && <div className="text-stone-400">{a.phone}</div>}
              </div>
              <div className="flex items-center gap-3 text-xs">
                {!a.isDefault && <button onClick={() => makeDefault(a.id)} className="text-stone-500 hover:text-stone-800">Set default</button>}
                <button onClick={() => remove(a.id)} className="text-stone-400 hover:text-rose-600" title="Remove"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}

          {adding ? (
            <form onSubmit={add} className="space-y-2 rounded-xl border border-stone-200 bg-white p-4">
              <div className="grid grid-cols-2 gap-2">
                <input value={form.name} onChange={f('name')} placeholder="Name" className="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
                <input value={form.phone} onChange={f('phone')} placeholder="Phone" className="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
              </div>
              <input value={form.line1} onChange={f('line1')} placeholder="Address line 1" className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" required />
              <input value={form.line2} onChange={f('line2')} placeholder="Address line 2 (optional)" className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
              <div className="grid grid-cols-3 gap-2">
                <input value={form.city} onChange={f('city')} placeholder="City" className="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
                <input value={form.state} onChange={f('state')} placeholder="State" className="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
                <input value={form.pincode} onChange={f('pincode')} placeholder="PIN" className="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-2">
                <button disabled={busy || !form.line1.trim()} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Save address</button>
                <button type="button" onClick={() => { setAdding(false); setForm(blank); }} className="rounded-lg px-4 py-2 text-sm text-stone-500">Cancel</button>
              </div>
            </form>
          ) : (
            <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-stone-300 px-4 py-2 text-sm text-stone-600 hover:border-stone-400">
              <Plus size={15} /> Add address
            </button>
          )}
        </div>
      )}
    </section>
  );
}
