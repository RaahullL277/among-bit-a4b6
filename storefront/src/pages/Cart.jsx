import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, money, STORE_ID } from '../api';
import { identify } from '../track';
import { useCart } from '../cart';

const emptyAddress = { name: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '' };

export default function Cart() {
  const { cart, cartId, clear } = useCart();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [rewards, setRewards] = useState(null); // {enabled, pointsBalance, ...}
  const [redeem, setRedeem] = useState(false);
  const [quote, setQuote] = useState(null);
  const [address, setAddress] = useState(() => JSON.parse(localStorage.getItem('shopper.address') || 'null') || emptyAddress);

  useEffect(() => {
    if (cartId) api.checkoutQuote(cartId).then(setQuote).catch(() => setQuote(null));
  }, [cartId, cart?.items?.length]);

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
    identify(email); // stitch this session's behaviour to the customer + attribution
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
      const hasAddress = address.line1 || address.pincode;
      if (hasAddress) localStorage.setItem('shopper.address', JSON.stringify(address));
      const res = await api.checkout(cartId, { email: email || undefined, redeemPoints, shippingAddress: hasAddress ? address : undefined });
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
        <div className="space-y-1 px-5 py-4 text-sm">
          <Row label="Subtotal" value={money(quote?.subtotalMinor ?? total)} />
          {quote?.shippingMinor > 0 && <Row label="Shipping" value={money(quote.shippingMinor)} />}
          {quote?.shippingMinor === 0 && quote?.subtotalMinor != null && <Row label="Shipping" value="Free" muted />}
          {quote?.taxMinor > 0 && <Row label={`${quote.taxLabel}${quote.pricesIncludeTax ? ' (incl.)' : ''}`} value={money(quote.taxMinor)} muted={quote.pricesIncludeTax} />}
          <div className="flex items-center justify-between border-t border-stone-100 pt-2">
            <span className="font-semibold text-stone-900">Total</span>
            <span className="text-lg font-semibold text-stone-900">{money(quote?.totalMinor ?? total)}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-medium text-stone-900">Delivery address</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input value={address.name} onChange={(e) => setAddress({ ...address, name: e.target.value })} placeholder="Full name" className="col-span-2 rounded-lg border border-stone-300 px-3 py-2 text-sm" />
          <input value={address.phone} onChange={(e) => setAddress({ ...address, phone: e.target.value })} placeholder="Phone" className="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
          <input value={address.pincode} onChange={(e) => setAddress({ ...address, pincode: e.target.value })} placeholder="PIN code" className="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
          <input value={address.line1} onChange={(e) => setAddress({ ...address, line1: e.target.value })} placeholder="Address line 1" className="col-span-2 rounded-lg border border-stone-300 px-3 py-2 text-sm" />
          <input value={address.line2} onChange={(e) => setAddress({ ...address, line2: e.target.value })} placeholder="Address line 2 (optional)" className="col-span-2 rounded-lg border border-stone-300 px-3 py-2 text-sm" />
          <input value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} placeholder="City" className="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
          <input value={address.state} onChange={(e) => setAddress({ ...address, state: e.target.value })} placeholder="State" className="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
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

function Row({ label, value, muted }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-stone-500">{label}</span>
      <span className={muted ? 'text-stone-400' : 'text-stone-800'}>{value}</span>
    </div>
  );
}
