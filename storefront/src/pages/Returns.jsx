import { useState } from 'react';
import { api, money, STORE_ID } from '../api';

const REASONS = [
  ['DAMAGED', 'Arrived damaged'],
  ['WRONG_ITEM', 'Wrong item'],
  ['NOT_AS_DESCRIBED', 'Not as described'],
  ['NO_LONGER_NEEDED', 'No longer needed'],
  ['OTHER', 'Other'],
];

export default function Returns() {
  const [number, setNumber] = useState('');
  const [email, setEmail] = useState('');
  const [order, setOrder] = useState(null);
  const [picked, setPicked] = useState({}); // orderItemId -> quantity
  const [reason, setReason] = useState('DAMAGED');
  const [comment, setComment] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);

  async function lookup(e) {
    e.preventDefault();
    setError('');
    setOrder(null);
    setBusy(true);
    try {
      const o = await api.orderLookup(STORE_ID, number, email);
      if (!o) {
        setError('No order found for that number and email.');
      } else {
        setOrder(o);
        setPicked(Object.fromEntries(o.items.map((i) => [i.orderItemId, i.quantity])));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const items = Object.entries(picked)
        .filter(([, q]) => q > 0)
        .map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
      if (!items.length) {
        setError('Select at least one item to return.');
        setBusy(false);
        return;
      }
      const res = await api.requestReturn(STORE_ID, {
        orderNumber: Number(number),
        email,
        reason,
        comment: comment || undefined,
        evidenceVideoUrl: videoUrl || undefined,
        items,
      });
      setDone(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm">
        <div className="text-3xl">↩️</div>
        <h1 className="mt-2 text-lg font-semibold text-stone-900">Return #{done.number} requested</h1>
        <p className="mt-1 text-sm text-stone-500">
          We've received your request and emailed the store. You'll hear back once it's reviewed.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-semibold text-stone-900">Start a return</h1>
      <p className="mt-1 text-sm text-stone-500">Look up your order to request a return or refund.</p>

      <form onSubmit={lookup} className="mt-5 flex gap-2">
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="Order number"
          className="w-32 rounded-lg border border-stone-300 px-3 py-2 text-sm"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email on the order"
          className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm"
        />
        <button disabled={busy} className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          Find
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

      {order && (
        <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-stone-500">Order #{order.number} — {order.status}</div>
          <div className="space-y-2">
            {order.items.map((i) => (
              <div key={i.orderItemId} className="flex items-center gap-3 rounded-lg border border-stone-200 p-2">
                <input
                  type="checkbox"
                  checked={(picked[i.orderItemId] ?? 0) > 0}
                  onChange={(e) => setPicked((c) => ({ ...c, [i.orderItemId]: e.target.checked ? i.quantity : 0 }))}
                  className="h-4 w-4"
                />
                <span className="flex-1 text-sm text-stone-800">{i.title}</span>
                <span className="text-xs text-stone-400">{money(i.unitPriceMinor, order.currency)}</span>
                <input
                  type="number"
                  min="0"
                  max={i.quantity}
                  value={picked[i.orderItemId] ?? 0}
                  onChange={(e) => setPicked((c) => ({ ...c, [i.orderItemId]: Math.min(i.quantity, Math.max(0, parseInt(e.target.value, 10) || 0)) }))}
                  className="w-16 rounded-md border border-stone-300 px-2 py-1 text-xs"
                />
              </div>
            ))}
          </div>

          <label className="block text-sm">
            <span className="text-stone-600">Reason</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm">
              {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-stone-600">Comment (optional)</span>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" rows={2} />
          </label>

          <label className="block text-sm">
            <span className="text-stone-600">Video evidence URL (optional)</span>
            <input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="Link to an unboxing/damage video"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-xs text-stone-400">Speeds up damage claims.</span>
          </label>

          <button disabled={busy} className="w-full rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50">
            Request return
          </button>
        </form>
      )}
    </div>
  );
}
