import { Link } from 'react-router-dom';
import { money } from './api';
import { useCart } from './cart';

/**
 * A horizontal rail of compact product cards — used for "Recently viewed" and
 * cart cross-sell ("You might also like"). Products are the storefront card
 * shape (id, title, imageUrl, variants[] or priceMinor).
 */
export default function ProductRail({ title, products }) {
  const { addToCart } = useCart();
  if (!products?.length) return null;
  const priceOf = (p) => (p.variants?.[0]?.priceMinor ?? p.priceMinor ?? null);
  const variantOf = (p) => p.variants?.[0]?.id ?? null;

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-stone-800">{title}</h2>
      <div className="-mx-1 flex gap-3 overflow-x-auto pb-2">
        {products.map((p) => {
          const price = priceOf(p);
          const vId = variantOf(p);
          return (
            <div key={p.id} className="flex w-40 flex-shrink-0 flex-col rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
              <Link to={`/product/${p.id}`} className="flex-1">
                <div className="mb-2 flex h-28 items-center justify-center overflow-hidden rounded-lg bg-stone-100">
                  {p.imageUrl ? <img src={p.imageUrl} alt={p.title} className="h-full w-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} /> : <span className="text-2xl">🛍️</span>}
                </div>
                <div className="line-clamp-2 text-sm font-medium text-stone-900">{p.title}</div>
              </Link>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-stone-900">{price != null ? money(price, p.variants?.[0]?.currency ?? p.currency) : '—'}</span>
                {vId && (
                  <button onClick={() => addToCart(vId, 1)} className="rounded-lg bg-stone-900 px-2 py-1 text-xs font-medium text-white hover:bg-stone-700" title="Add to cart">Add</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
