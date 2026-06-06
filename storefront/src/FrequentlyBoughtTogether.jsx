import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, STORE_ID } from './api';
import { useCart } from './cart';

/**
 * Product-page conversion widget. Shows curated "buy together & save" bundles
 * (the saving auto-applies at checkout) and, as a fallback, an automatic
 * frequently-bought-together list built from the store's order history.
 */
export default function FrequentlyBoughtTogether({ productId }) {
  const { addToCart } = useCart();
  const [bundles, setBundles] = useState(null);
  const [fbt, setFbt] = useState([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!productId) return;
    api.productBundles(STORE_ID, productId).then(setBundles).catch(() => setBundles([]));
    api.frequentlyBoughtTogether(STORE_ID, productId).then(setFbt).catch(() => setFbt([]));
  }, [productId]);

  async function addBundle(bundle) {
    setAdding(true);
    try {
      for (const item of bundle.items) await addToCart(item.variantId, item.quantity);
    } finally {
      setAdding(false);
    }
  }

  if (!bundles) return null;
  const hasBundles = bundles.length > 0;
  const showFbt = !hasBundles && fbt.length > 0;
  if (!hasBundles && !showFbt) return null;

  return (
    <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-stone-900">Frequently bought together</h2>

      {hasBundles &&
        bundles.map((b) => (
          <div key={b.id} className="mt-4 rounded-xl border border-stone-200 p-4">
            <div className="font-medium text-stone-900">{b.title}</div>
            {b.description && <p className="mt-0.5 text-sm text-stone-500">{b.description}</p>}
            <ul className="mt-3 space-y-1">
              {b.items.map((i) => (
                <li key={i.variantId} className="flex justify-between text-sm text-stone-600">
                  <span>
                    {i.quantity > 1 ? `${i.quantity}× ` : ''}
                    <Link to={`/product/${i.productId}`} className="hover:text-stone-900 hover:underline">
                      {i.productTitle}
                    </Link>
                  </span>
                  <span>{money(i.unitPriceMinor * i.quantity, b.currency)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-3">
              <div className="text-sm">
                <span className="text-stone-400 line-through">{money(b.subtotalMinor, b.currency)}</span>{' '}
                <span className="font-semibold text-stone-900">{money(b.totalMinor, b.currency)}</span>
                {b.discountMinor > 0 && (
                  <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    Save {money(b.discountMinor, b.currency)}
                  </span>
                )}
              </div>
              <button
                disabled={adding}
                onClick={() => addBundle(b)}
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-60"
              >
                Add bundle
              </button>
            </div>
          </div>
        ))}

      {showFbt && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {fbt.map((p) => (
            <div key={p.productId} className="flex flex-col rounded-xl border border-stone-200 p-3">
              <Link to={`/product/${p.productId}`} className="flex-1">
                <div className="mb-2 flex h-20 items-center justify-center rounded-lg bg-stone-100 text-2xl">🛍️</div>
                <div className="text-sm font-medium text-stone-900">{p.title}</div>
              </Link>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-stone-900">{money(p.priceMinor, p.currency)}</span>
                <button
                  disabled={adding}
                  onClick={() => addToCart(p.variantId, 1)}
                  className="rounded-lg border border-stone-300 px-2 py-1 text-xs font-medium hover:bg-stone-50 disabled:opacity-60"
                >
                  Add
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
