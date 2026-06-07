import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CheckCircle2, Clock } from 'lucide-react';
import { api, money, STORE_ID } from '../api';

const PAID = new Set(['PAID', 'FULFILLED']);

export default function Confirmation() {
  const { state } = useLocation();
  const order = state?.order;
  const checkout = state?.checkout;
  const email = state?.email;
  const [status, setStatus] = useState(order?.status ?? 'PENDING');

  // Poll order status so the page reflects "payment received" once captured.
  useEffect(() => {
    if (!order?.number || !email || PAID.has(status)) return;
    let active = true;
    const tick = () => api.trackOrder(STORE_ID, order.number, email).then((o) => {
      if (active && o?.status) setStatus(o.status);
    }).catch(() => undefined);
    tick();
    const iv = setInterval(tick, 4000);
    return () => { active = false; clearInterval(iv); };
  }, [order, email, status]);

  if (!order) {
    return (
      <div className="mx-auto max-w-md text-center">
        <p className="text-stone-500">No recent order.</p>
        <Link to="/" className="mt-3 inline-block text-stone-900 underline">Back to store</Link>
      </div>
    );
  }

  const paid = PAID.has(status);

  return (
    <div className="mx-auto max-w-md text-center">
      {paid ? <CheckCircle2 className="mx-auto text-emerald-500" size={48} /> : <Clock className="mx-auto text-amber-500" size={44} />}
      <h1 className="mt-3 text-xl font-semibold text-stone-900">Order #{order.number} {paid ? 'confirmed' : 'placed'}</h1>
      <p className="mt-1 text-stone-600">Total {money(order.totalMinor, order.currency)}</p>

      {paid ? (
        <p className="mt-2 text-sm text-emerald-600">Payment received — thank you! We'll email your confirmation and updates.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-stone-500">Complete your secure payment to confirm the order.</p>
          {checkout?.hostedCheckoutUrl && (
            <a href={checkout.hostedCheckoutUrl} className="mt-5 inline-block rounded-lg bg-stone-900 px-5 py-2.5 font-medium text-white hover:bg-stone-700">
              Pay now
            </a>
          )}
          <p className="mt-3 text-xs text-stone-400">This page updates automatically once your payment is received.</p>
        </>
      )}

      <div className="mt-6 flex items-center justify-center gap-4 text-sm">
        {email && <Link to="/track" className="text-stone-500 underline hover:text-stone-800">Track order</Link>}
        <Link to="/" className="text-stone-500 underline hover:text-stone-800">Continue shopping</Link>
      </div>
    </div>
  );
}
