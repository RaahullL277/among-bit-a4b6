import { Link, useLocation } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { money } from '../api';

export default function Confirmation() {
  const { state } = useLocation();
  const order = state?.order;
  const checkout = state?.checkout;

  if (!order) {
    return (
      <div className="mx-auto max-w-md text-center">
        <p className="text-stone-500">No recent order.</p>
        <Link to="/" className="mt-3 inline-block text-stone-900 underline">Back to store</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md text-center">
      <CheckCircle2 className="mx-auto text-emerald-500" size={48} />
      <h1 className="mt-3 text-xl font-semibold text-stone-900">Order #{order.number} placed</h1>
      <p className="mt-1 text-stone-600">Total {money(order.totalMinor, order.currency)}</p>
      <p className="mt-1 text-sm text-stone-500">
        Payment is pending. Complete it via the secure checkout below.
      </p>

      {checkout?.hostedCheckoutUrl && (
        <a
          href={checkout.hostedCheckoutUrl}
          className="mt-5 inline-block rounded-lg bg-stone-900 px-5 py-2.5 font-medium text-white hover:bg-stone-700"
        >
          Pay now
        </a>
      )}
      <div className="mt-6">
        <Link to="/" className="text-sm text-stone-500 underline hover:text-stone-800">Continue shopping</Link>
      </div>
    </div>
  );
}
