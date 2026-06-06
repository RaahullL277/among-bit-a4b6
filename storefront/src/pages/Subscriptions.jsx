import { useState } from 'react';
import { api, money, STORE_ID } from '../api';

const INTERVAL_LABEL = { WEEKLY: 'Weekly', BIWEEKLY: 'Every 2 weeks', MONTHLY: 'Monthly', QUARTERLY: 'Quarterly' };

export default function Subscriptions() {
  const [email, setEmail] = useState('');
  const [subs, setSubs] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load(e) {
    e?.preventDefault();
    setError('');
    setBusy(true);
    try {
      const list = await api.mySubscriptions(STORE_ID, email);
      setSubs(list);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function manage(subId, status) {
    await api.manageSubscription(STORE_ID, subId, { email, status });
    load();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold text-stone-900">Manage subscriptions</h1>
      <p className="mt-1 text-sm text-stone-500">Enter your email to view and manage your subscriptions.</p>

      <form onSubmit={load} className="mt-5 flex gap-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm"
        />
        <button disabled={busy} className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          View
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

      {subs && subs.length === 0 && <p className="mt-6 text-stone-500">No subscriptions found for that email.</p>}

      {subs && subs.length > 0 && (
        <div className="mt-6 space-y-3">
          {subs.map((s) => (
            <div key={s.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium text-stone-900">{s.productTitle}</div>
                  <div className="text-sm text-stone-500">
                    {s.quantity}× · {INTERVAL_LABEL[s.interval] ?? s.interval}
                    {s.discountPercent > 0 ? ` · ${s.discountPercent}% off` : ''}
                  </div>
                  <div className="mt-1 text-xs text-stone-400">
                    {s.status === 'ACTIVE' ? `Next order ${new Date(s.nextBillingAt).toLocaleDateString()}` : s.status}
                  </div>
                </div>
                <div className="text-right text-sm font-semibold text-stone-900">
                  {money(Math.round((s.unitPriceMinor ?? 0) * s.quantity * (1 - s.discountPercent / 100)))}
                </div>
              </div>
              {s.status !== 'CANCELLED' && (
                <div className="mt-3 flex gap-2">
                  {s.status === 'ACTIVE' ? (
                    <button onClick={() => manage(s.id, 'PAUSED')} className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs hover:bg-stone-50">Pause</button>
                  ) : (
                    <button onClick={() => manage(s.id, 'ACTIVE')} className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs hover:bg-stone-50">Resume</button>
                  )}
                  <button onClick={() => manage(s.id, 'CANCELLED')} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50">Cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
