import { useState } from 'react';
import { api, money, STORE_ID } from '../api';

const STATUS_COLOR = {
  PENDING: 'bg-amber-100 text-amber-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  FULFILLED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-stone-100 text-stone-500',
  REFUNDED: 'bg-rose-100 text-rose-700',
};

export default function Track() {
  const [number, setNumber] = useState('');
  const [email, setEmail] = useState('');
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState('');

  async function lookup(e) {
    e.preventDefault();
    setError(''); setNotice(''); setOrder(null); setLoading(true);
    try {
      const o = await api.trackOrder(STORE_ID, number.trim(), email.trim());
      if (!o) setError('No order found for that number and email.');
      else setOrder(o);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function cancel() {
    if (!window.confirm('Cancel this order? If it was paid, you’ll be refunded.')) return;
    setCancelling(true); setError(''); setNotice('');
    try {
      const r = await api.cancelOrder(STORE_ID, { number: order.number, email: email.trim() });
      setNotice(r.refunded ? 'Order cancelled — a refund has been issued.' : 'Order cancelled.');
      const o = await api.trackOrder(STORE_ID, order.number, email.trim());
      setOrder(o);
    } catch (e) {
      setError(e.message || 'Could not cancel this order.');
    } finally {
      setCancelling(false);
    }
  }

  // Optimistic hint; the server enforces the cancellation window/policy.
  const cancellable = order && ['PENDING', 'PAID'].includes(order.status) && !order.shipment;

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-lg font-semibold text-stone-900">Track your order</h1>
      <form onSubmit={lookup} className="mt-4 space-y-3">
        <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Order number" className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email used at checkout" className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
        <button disabled={loading || !number.trim() || !email.trim()} className="w-full rounded-lg bg-stone-900 px-4 py-2 font-medium text-white disabled:opacity-50">
          {loading ? 'Looking up…' : 'Track order'}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
      {notice && <p className="mt-4 text-sm text-emerald-600">{notice}</p>}

      {order && (
        <div className="mt-6 rounded-xl border border-stone-200 p-5">
          <div className="flex items-center justify-between">
            <div className="font-medium text-stone-900">Order #{order.number}</div>
            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[order.status] ?? 'bg-stone-100 text-stone-600'}`}>{order.status}</span>
          </div>
          <div className="mt-1 text-xs text-stone-400">Placed {new Date(order.placedAt).toLocaleDateString()}</div>

          <div className="mt-4 space-y-1">
            {order.items.map((i, idx) => (
              <div key={idx} className="flex justify-between text-sm text-stone-600">
                <span>{i.title} × {i.quantity}</span>
                <span>{money(i.unitPriceMinor * i.quantity, order.currency)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between border-t border-stone-100 pt-2 text-sm font-semibold text-stone-900">
            <span>Total</span><span>{money(order.totalMinor, order.currency)}</span>
          </div>

          <div className="mt-4 rounded-lg bg-stone-50 p-3 text-sm">
            <div className="font-medium text-stone-700">Shipment</div>
            {order.shipment ? (
              <div className="mt-1 text-stone-600">
                {order.shipment.status}{order.shipment.courier ? ` · ${order.shipment.courier}` : ''}
                {order.shipment.awb && <> · AWB {order.shipment.awb}</>}
                {order.shipment.trackingUrl && (
                  <> · <a href={order.shipment.trackingUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">Track parcel</a></>
                )}
              </div>
            ) : (
              <div className="mt-1 text-stone-400">Not shipped yet — we’ll email you tracking when it’s on the way.</div>
            )}
          </div>

          {order.invoice && (
            <a
              href={api.invoiceUrl(STORE_ID, order.number, email.trim())}
              target="_blank"
              rel="noreferrer"
              className="mt-4 block w-full rounded-lg border border-stone-300 px-4 py-2 text-center text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              Download {order.invoice.isTaxInvoice ? 'tax invoice' : 'invoice'} ({order.invoice.invoiceNo})
            </a>
          )}

          {cancellable && (
            <button
              onClick={cancel}
              disabled={cancelling}
              className="mt-4 w-full rounded-lg border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            >
              {cancelling ? 'Cancelling…' : 'Cancel this order'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
