import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { api, applySeo, money, STORE_ID } from '../api';
import { track } from '../track';
import { useCart } from '../cart';
import Reviews from '../Reviews';
import FrequentlyBoughtTogether from '../FrequentlyBoughtTogether';

const INTERVAL_LABEL = { WEEKLY: 'Every week', BIWEEKLY: 'Every 2 weeks', MONTHLY: 'Every month', QUARTERLY: 'Every 3 months' };

export default function Product() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const [product, setProduct] = useState(null);
  const [qty, setQty] = useState(1);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState(false);

  // Subscribe & save.
  const [subSettings, setSubSettings] = useState(null);
  const [subscribe, setSubscribe] = useState(false);
  const [interval, setInterval] = useState('MONTHLY');
  const [subEmail, setSubEmail] = useState('');
  const [subMsg, setSubMsg] = useState('');

  useEffect(() => {
    api.product(STORE_ID, id).then(setProduct).catch((e) => setError(e.message));
    api.productSeo(STORE_ID, id).then(applySeo).catch(() => undefined);
    track('VIEW', id); // product view → cohort signal
    api.subscriptionSettings(STORE_ID)
      .then((s) => {
        setSubSettings(s);
        if (s?.intervals?.length) setInterval(s.intervals[0]);
      })
      .catch(() => undefined);
  }, [id]);

  if (error) return <p className="text-rose-600">{error}</p>;
  if (!product) return <p className="text-stone-500">Loading…</p>;
  const v = product.variants?.[0];
  const subEnabled = subSettings?.enabled && (subSettings?.intervals?.length ?? 0) > 0;
  const subPrice = v && subSettings ? Math.round(v.priceMinor * (1 - subSettings.discountPercent / 100)) : 0;

  async function add(goToCart) {
    setAdding(true);
    try {
      await addToCart(v.id, qty);
      track('ADD_TO_CART', product.id);
      if (goToCart) navigate('/cart');
    } finally {
      setAdding(false);
    }
  }

  async function saveToWishlist() {
    let email = localStorage.getItem('shopper.email');
    if (!email) {
      email = window.prompt('Enter your email to save to your wishlist:')?.trim();
      if (!email) return;
      localStorage.setItem('shopper.email', email);
    }
    try { await api.addWishlist(STORE_ID, { email, productId: product.id }); setSaved(true); } catch { /* ignore */ }
  }

  async function startSubscription() {
    setSubMsg('');
    if (!subEmail) {
      setSubMsg('Enter your email to subscribe.');
      return;
    }
    setAdding(true);
    try {
      await api.subscribe(STORE_ID, { variantId: v.id, quantity: qty, interval, email: subEmail });
      setSubMsg('Subscribed! Manage it any time on the Subscriptions page.');
    } catch (e) {
      setSubMsg(e.message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/" className="text-sm text-stone-500 hover:text-stone-800">← Back</Link>
      <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex h-48 items-center justify-center rounded-xl bg-stone-100 text-5xl">🛍️</div>
        <h1 className="text-xl font-semibold text-stone-900">{product.title}</h1>
        {product.description && <p className="mt-2 text-stone-600">{product.description}</p>}
        <div className="mt-4 text-2xl font-semibold text-stone-900">{v ? money(v.priceMinor, v.currency) : '—'}</div>

        {subEnabled && v && (
          <div className="mt-4 space-y-2 rounded-xl border border-stone-200 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-stone-800">
              <input type="radio" checked={!subscribe} onChange={() => setSubscribe(false)} /> One-time purchase
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-stone-800">
              <input type="radio" checked={subscribe} onChange={() => setSubscribe(true)} />
              Subscribe &amp; save {subSettings.discountPercent}% — {money(subPrice, v.currency)}
            </label>
            {subscribe && (
              <div className="space-y-2 pl-6">
                <select value={interval} onChange={(e) => setInterval(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm">
                  {subSettings.intervals.map((iv) => <option key={iv} value={iv}>{INTERVAL_LABEL[iv] ?? iv}</option>)}
                </select>
                <input value={subEmail} onChange={(e) => setSubEmail(e.target.value)} placeholder="you@example.com" className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex items-center gap-3">
          <input
            type="number"
            min="1"
            value={qty}
            onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="w-20 rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
          {subscribe ? (
            <button
              disabled={adding}
              onClick={startSubscription}
              className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-60"
            >
              Subscribe
            </button>
          ) : (
            <>
              <button
                disabled={adding}
                onClick={() => add(false)}
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50 disabled:opacity-60"
              >
                Add to cart
              </button>
              <button
                disabled={adding}
                onClick={() => add(true)}
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-60"
              >
                Buy now
              </button>
              <button
                onClick={saveToWishlist}
                title="Save to wishlist"
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium ${saved ? 'border-rose-200 text-rose-600' : 'border-stone-300 text-stone-600 hover:bg-stone-50'}`}
              >
                <Heart size={16} fill={saved ? 'currentColor' : 'none'} /> {saved ? 'Saved' : 'Save'}
              </button>
            </>
          )}
        </div>
        {subMsg && <p className="mt-3 text-sm text-stone-600">{subMsg}</p>}
      </div>
      <FrequentlyBoughtTogether productId={product.id} />
      <Reviews productId={product.id} />
    </div>
  );
}
