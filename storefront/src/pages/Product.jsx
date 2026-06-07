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
  const [selected, setSelected] = useState({}); // option name → value
  const [imageIdx, setImageIdx] = useState(0);

  // Subscribe & save.
  const [subSettings, setSubSettings] = useState(null);
  const [subscribe, setSubscribe] = useState(false);
  const [interval, setInterval] = useState('MONTHLY');
  const [subEmail, setSubEmail] = useState('');
  const [subMsg, setSubMsg] = useState('');

  useEffect(() => {
    api.product(STORE_ID, id).then(setProduct).catch((e) => setError(e.message));
    api.productSeo(STORE_ID, id).then((seo) => applySeo({ ...seo, type: 'product' })).catch(() => undefined);
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

  // Resolve the active variant from the chosen options (or the first variant).
  const options = product.options ?? [];
  const allChosen = options.length > 0 && options.every((o) => selected[o.name]);
  const v = allChosen
    ? product.variants.find((vr) => options.every((o) => String((vr.options || {})[o.name]) === selected[o.name])) ?? null
    : product.variants?.[0];

  const images = product.images ?? [];
  const mainImage = images[imageIdx]?.url ?? images[0]?.url ?? null;
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
        {/* Image gallery */}
        <div className="mb-4 flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-stone-100">
          {mainImage ? (
            <img src={mainImage} alt={product.title} className="h-full w-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
          ) : (
            <span className="text-5xl">🛍️</span>
          )}
        </div>
        {images.length > 1 && (
          <div className="mb-4 flex gap-2 overflow-x-auto">
            {images.map((img, i) => (
              <button key={img.id ?? i} onClick={() => setImageIdx(i)} className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 ${i === imageIdx ? 'border-stone-900' : 'border-transparent'}`}>
                <img src={img.url} alt={img.alt ?? ''} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
        <h1 className="text-xl font-semibold text-stone-900">{product.title}</h1>
        {product.brand && <div className="mt-0.5 text-sm text-stone-500">{product.brand}</div>}
        {product.description && <p className="mt-2 text-stone-600">{product.description}</p>}

        {/* Variant option selectors */}
        {options.map((o) => (
          <div key={o.id ?? o.name} className="mt-4">
            <div className="mb-1 text-sm font-medium text-stone-700">{o.name}</div>
            <div className="flex flex-wrap gap-2">
              {o.values.map((val) => (
                <button
                  key={val.id ?? val.value}
                  onClick={() => { setSelected({ ...selected, [o.name]: val.value }); }}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${selected[o.name] === val.value ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 text-stone-700 hover:bg-stone-50'}`}
                >
                  {val.value}
                </button>
              ))}
            </div>
          </div>
        ))}
        {options.length > 0 && !v && <p className="mt-2 text-sm text-amber-600">Select {options.map((o) => o.name).join(' & ')} to continue.</p>}
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-stone-900">{v ? money(v.priceMinor, v.currency) : '—'}</span>
          {v?.compareAtMinor > v?.priceMinor && (
            <>
              <span className="text-base text-stone-400 line-through">{money(v.compareAtMinor, v.currency)}</span>
              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-xs font-semibold text-rose-700">{Math.round((1 - v.priceMinor / v.compareAtMinor) * 100)}% off</span>
            </>
          )}
        </div>
        {v?.availability === 'out_of_stock' && <p className="mt-1 text-sm font-medium text-rose-600">Out of stock</p>}
        {v?.availability === 'low_stock' && <p className="mt-1 text-sm font-medium text-amber-600">Low stock — order soon</p>}

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
                disabled={adding || !v || v?.availability === 'out_of_stock'}
                onClick={() => add(false)}
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50 disabled:opacity-60"
              >
                {v?.availability === 'out_of_stock' ? 'Sold out' : 'Add to cart'}
              </button>
              <button
                disabled={adding || !v || v?.availability === 'out_of_stock'}
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
      {/* B2B quantity price-breaks */}
      {v?.priceTiers?.length > 0 && (
        <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-stone-900">Bulk pricing{product.moq ? ` · MOQ ${product.moq}` : ''}{product.leadTimeDays ? ` · ${product.leadTimeDays}-day lead time` : ''}</div>
          <table className="w-full text-sm">
            <tbody>
              <tr className="text-stone-600"><td className="py-1">1+</td><td className="py-1 text-right">{money(v.priceMinor, v.currency)}/unit</td></tr>
              {v.priceTiers.map((t) => (
                <tr key={t.id} className="text-stone-600"><td className="py-1">{t.minQuantity}+</td><td className="py-1 text-right font-medium text-stone-900">{money(t.priceMinor, v.currency)}/unit</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Specifications */}
      {product.attributes?.length > 0 && (
        <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-stone-900">Specifications</div>
          <table className="w-full text-sm">
            <tbody>
              {product.attributes.map((a) => (
                <tr key={a.id} className="border-b border-stone-100 last:border-0">
                  <td className="py-1.5 pr-4 text-stone-500">{a.name}</td>
                  <td className="py-1.5 text-stone-800">{a.value}{a.unit ? ` ${a.unit}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(product.ingredients || product.countryOfOrigin || product.warrantyMonths) && (
            <div className="mt-3 space-y-1 text-xs text-stone-500">
              {product.warrantyMonths ? <div>Warranty: {product.warrantyMonths} months{product.warrantyTerms ? ` — ${product.warrantyTerms}` : ''}</div> : null}
              {product.countryOfOrigin ? <div>Country of origin: {product.countryOfOrigin}</div> : null}
              {product.ingredients ? <div>Ingredients: {product.ingredients}</div> : null}
            </div>
          )}
        </div>
      )}

      {/* Documents (datasheets, certificates, size charts) */}
      {product.assets?.length > 0 && (
        <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-stone-900">Documents</div>
          <ul className="space-y-1 text-sm">
            {product.assets.map((d) => (
              <li key={d.id}>
                <a href={d.url} target="_blank" rel="noreferrer" className="text-stone-700 underline hover:text-stone-900">
                  {d.title || d.type.replace('_', ' ').toLowerCase()}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <FrequentlyBoughtTogether productId={product.id} />
      <Reviews productId={product.id} />
    </div>
  );
}
