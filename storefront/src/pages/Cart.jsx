import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, money, STORE_ID } from '../api';
import { identify } from '../track';
import { useCart } from '../cart';
import { useAccount } from '../account';

const emptyAddress = { name: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '', gstin: '' };

// Map a saved CustomerAddress to the checkout address shape.
function pickAddress(a) {
  return { name: a.name ?? '', phone: a.phone ?? '', line1: a.line1 ?? '', line2: a.line2 ?? '', city: a.city ?? '', state: a.state ?? '', pincode: a.pincode ?? '', gstin: '' };
}

export default function Cart() {
  const { cart, cartId, clear, setQty, removeItem } = useCart();
  const { customer, signedIn } = useAccount();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [saveAddress, setSaveAddress] = useState(false);
  const [rewards, setRewards] = useState(null); // {enabled, pointsBalance, ...}
  const [redeem, setRedeem] = useState(false);
  const [quote, setQuote] = useState(null);
  const [address, setAddress] = useState(() => JSON.parse(localStorage.getItem('shopper.address') || 'null') || emptyAddress);
  const [policies, setPolicies] = useState([]);
  const [marketingOptIn, setMarketingOptIn] = useState(false); // optional, off by default
  const [code, setCode] = useState('');
  const [discount, setDiscount] = useState(null);
  const [codeMsg, setCodeMsg] = useState('');

  useEffect(() => {
    if (cartId) api.checkoutQuote(cartId).then(setQuote).catch(() => setQuote(null));
  }, [cartId, cart?.items?.length]);

  useEffect(() => {
    api.legalPolicies(STORE_ID).then(setPolicies).catch(() => setPolicies([]));
  }, []);

  // Signed-in buyers: prefill email and offer their saved addresses.
  useEffect(() => {
    if (!signedIn) return;
    if (customer?.email && !email) setEmail(customer.email);
    api.account.addresses().then((list) => {
      setSavedAddresses(list);
      const def = list.find((a) => a.isDefault) ?? list[0];
      if (def) setAddress((cur) => (cur.line1 || cur.pincode ? cur : pickAddress(def)));
    }).catch(() => undefined);
  }, [signedIn, customer]);

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

  async function applyCode() {
    setCodeMsg('');
    const c = code.trim();
    if (!c) return;
    try {
      const r = await api.validateDiscount(cartId, c);
      if (r.valid) { setDiscount(r); setCodeMsg(''); }
      else { setDiscount(null); setCodeMsg('That code can’t be applied.'); }
    } catch { setDiscount(null); setCodeMsg('Could not check that code.'); }
  }

  async function checkout() {
    setLoading(true);
    setError('');
    try {
      const redeemPoints = redeem && rewards?.pointsBalance >= (rewards?.minRedeemPoints ?? 0) ? rewards.pointsBalance : undefined;
      const hasAddress = address.line1 || address.pincode;
      if (hasAddress) localStorage.setItem('shopper.address', JSON.stringify(address));
      // Signed-in buyers can save this address to their account for next time.
      if (signedIn && saveAddress && address.line1) {
        await api.account.addAddress(address).catch(() => undefined);
      }
      const res = await api.checkout(cartId, { email: email || undefined, redeemPoints, shippingAddress: hasAddress ? address : undefined, marketingOptIn: marketingOptIn || undefined, discountCode: discount ? code.trim() : undefined });
      clear();
      navigate('/confirmation', { state: { ...res, email } });
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
          <div key={i.id} className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-4 last:border-0">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-stone-900">{i.title}</div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="inline-flex items-center rounded-lg border border-stone-300">
                  <button onClick={() => setQty(i.variantId, i.quantity - 1)} className="px-2.5 py-1 text-stone-600 hover:bg-stone-50" aria-label="Decrease quantity">−</button>
                  <span className="min-w-7 px-1 text-center text-sm text-stone-800">{i.quantity}</span>
                  <button onClick={() => setQty(i.variantId, i.quantity + 1)} className="px-2.5 py-1 text-stone-600 hover:bg-stone-50" aria-label="Increase quantity">+</button>
                </div>
                <button onClick={() => removeItem(i.variantId)} className="text-xs text-stone-400 hover:text-rose-600">Remove</button>
              </div>
            </div>
            <div className="whitespace-nowrap font-medium text-stone-800">{money(i.unitPriceMinor * i.quantity)}</div>
          </div>
        ))}
        <div className="space-y-1 px-5 py-4 text-sm">
          <Row label="Subtotal" value={money(quote?.subtotalMinor ?? total)} />
          {discount && <Row label={`Discount (${code.trim().toUpperCase()})`} value={`-${money(discount.discountMinor)}`} muted />}
          {quote?.shippingMinor > 0 && <Row label="Shipping" value={money(quote.shippingMinor)} />}
          {quote?.shippingMinor === 0 && quote?.subtotalMinor != null && <Row label="Shipping" value="Free" muted />}
          {quote?.taxMinor > 0 && <Row label={`${quote.taxLabel}${quote.pricesIncludeTax ? ' (incl.)' : ''}`} value={money(quote.taxMinor)} muted={quote.pricesIncludeTax} />}
          <div className="flex items-center justify-between border-t border-stone-100 pt-2">
            <span className="font-semibold text-stone-900">Total</span>
            <span className="text-lg font-semibold text-stone-900">{money(Math.max(0, (quote?.totalMinor ?? total) - (discount?.discountMinor ?? 0)))}</span>
          </div>
          {/* Coupon code */}
          <div className="flex gap-2 pt-2">
            <input value={code} onChange={(e) => { setCode(e.target.value); setDiscount(null); }} placeholder="Discount code" className="flex-1 rounded-lg border border-stone-300 px-3 py-1.5 text-sm" />
            <button type="button" onClick={applyCode} disabled={!code.trim()} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-50 disabled:opacity-50">Apply</button>
          </div>
          {discount && <p className="text-xs text-emerald-600">Code applied — you save {money(discount.discountMinor)}.</p>}
          {codeMsg && <p className="text-xs text-rose-500">{codeMsg}</p>}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-medium text-stone-900">Delivery address</div>
        {savedAddresses.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {savedAddresses.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAddress(pickAddress(a))}
                className="rounded-full border border-stone-300 px-3 py-1 text-xs text-stone-600 hover:border-stone-400"
              >
                {a.name || 'Address'}{a.pincode ? ` · ${a.pincode}` : ''}{a.isDefault ? ' · Default' : ''}
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input value={address.name} onChange={(e) => setAddress({ ...address, name: e.target.value })} placeholder="Full name" className="col-span-2 rounded-lg border border-stone-300 px-3 py-2 text-sm" />
          <input value={address.phone} onChange={(e) => setAddress({ ...address, phone: e.target.value })} placeholder="Phone" className="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
          <input value={address.pincode} onChange={(e) => setAddress({ ...address, pincode: e.target.value })} placeholder="PIN code" className="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
          <input value={address.line1} onChange={(e) => setAddress({ ...address, line1: e.target.value })} placeholder="Address line 1" className="col-span-2 rounded-lg border border-stone-300 px-3 py-2 text-sm" />
          <input value={address.line2} onChange={(e) => setAddress({ ...address, line2: e.target.value })} placeholder="Address line 2 (optional)" className="col-span-2 rounded-lg border border-stone-300 px-3 py-2 text-sm" />
          <input value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} placeholder="City" className="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
          <input value={address.state} onChange={(e) => setAddress({ ...address, state: e.target.value })} placeholder="State" className="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
          <input value={address.gstin} onChange={(e) => setAddress({ ...address, gstin: e.target.value.toUpperCase() })} placeholder="GSTIN (optional, for business invoice)" className="col-span-2 rounded-lg border border-stone-300 px-3 py-2 text-sm" />
        </div>
        {signedIn && (
          <label className="mt-3 flex items-center gap-2 text-sm text-stone-600">
            <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />
            Save this address to my account
          </label>
        )}
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

      {/* Optional marketing opt-in — off by default. */}
      <label className="mt-4 flex items-start gap-2 text-sm text-stone-600">
        <input type="checkbox" checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)} className="mt-0.5" />
        <span>Email me offers, news and updates (optional — you can unsubscribe anytime).</span>
      </label>

      {/* Implicit legal acceptance: placing the order agrees to the policies. */}
      {policies.length > 0 && (
        <p className="mt-2 text-xs text-stone-400">
          By placing your order you agree to our{' '}
          {policies.map((p, i) => (
            <span key={p.type}>
              {i > 0 && (i === policies.length - 1 ? ' and ' : ', ')}
              <Link to={`/legal/${p.slug}`} className="underline hover:text-stone-600">{p.title}</Link>
            </span>
          ))}.
        </p>
      )}

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
