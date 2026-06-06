import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, money, STORE_ID } from '../api';
import { useCart } from '../cart';

export default function Cart() {
  const { cart, cartId, clear } = useCart();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [rewards, setRewards] = useState(null); // {enabled, pointsBalance, ...}
  const [redeem, setRedeem] = useState(false);

  if (!cart || !cart.items?.length) {
    return (
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-stone-500">Your cart is empty.</p>
        <Link to="/" className="mt-3 inline-block text-stone-900 underline">Browse products</Link>
      </div>
    );
  }

  const total = cart.items.reduce((s, i) => s + i.unitPriceMinor * i.quantity, 0);

  async function checkRewards() {
    if (!email) return;
    try {
      const r = await api.loyalty(STORE_ID, email);
      setRewards(r);
    } catch {
      setRewards(null);
    }
  }

  async function checkout() {
    setLoading(true);
    setError('');
    try {
      const redeemPoints = redeem && rewards?.pointsBalance >= (rewards?.minRedeemPoints ?? 0) ? rewards.pointsBalance : undefined;
      const res = await api.checkout(cartId, { email: email || undefined, redeemPoints });
      clear();
      navigate('/confirmation', { state: res });
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-semibold text-stone-900">Your cart</h1>
      <div className="rounded-2xl border border-stone-200 bg-white shadow-sm">
        {cart.items.map((i) => (
          <div key={i.id} className="flex items-center justify-between border-b border-stone-100 px-5 py-4 last:border-0">
            <div>
              <div className="font-medium text-stone-900">{i.title}</div>
              <div className="text-sm text-stone-500">Qty {i.quantity}</div>
            </div>
            <div className="font-medium text-stone-800">{money(i.unitPriceMinor * i.quantity)}</div>
          </div>
        ))}
        <div className="flex items-center justify-between px-5 py-4">
          <span className="font-semibold text-stone-900">Total</span>
          <span className="text-lg font-semibold text-stone-900">{money(total)}</span>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-medium text-stone-900">Email & rewards</div>
        <div className="mt-2 flex gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={checkRewards}
            placeholder="you@example.com"
            className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
          <button type="button" onClick={checkRewards} className="rounded-lg border border-stone-300 px-3 py-2 text-sm hover:bg-stone-50">
            Check points
          </button>
        </div>
        {rewards?.enabled && rewards?.found && (
          <label className="mt-3 flex items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" checked={redeem} onChange={(e) => setRedeem(e.target.checked)} disabled={rewards.pointsBalance < (rewards.minRedeemPoints ?? 0)} />
            Redeem {rewards.pointsBalance} points{rewards.tier ? ` · ${rewards.tier} member` : ''}
            {rewards.pointsBalance < (rewards.minRedeemPoints ?? 0) && (
              <span className="text-xs text-stone-400">(min {rewards.minRedeemPoints})</span>
            )}
          </label>
        )}
        {rewards && rewards.enabled && !rewards.found && (
          <p className="mt-2 text-xs text-stone-400">You'll start earning points with this order.</p>
        )}
      </div>

      {error && <p className="mt-3 text-rose-600">{error}</p>}
      <button
        onClick={checkout}
        disabled={loading}
        className="mt-4 w-full rounded-lg bg-stone-900 px-4 py-3 font-medium text-white hover:bg-stone-700 disabled:opacity-60"
      >
        {loading ? 'Placing order…' : 'Checkout'}
      </button>
    </div>
  );
}
