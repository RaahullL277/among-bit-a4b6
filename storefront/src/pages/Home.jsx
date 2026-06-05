import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, STORE_ID } from '../api';
import { useCart } from '../cart';

export default function Home() {
  const { addToCart } = useCart();
  const [products, setProducts] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.products(STORE_ID).then(setProducts).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-rose-600">{error}</p>;
  if (!products) return <p className="text-stone-500">Loading…</p>;
  if (!products.length) return <p className="text-stone-500">No products available.</p>;

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((p) => {
        const v = p.variants?.[0];
        return (
          <div key={p.id} className="flex flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <Link to={`/product/${p.id}`} className="flex-1">
              <div className="mb-3 flex h-32 items-center justify-center rounded-xl bg-stone-100 text-3xl">🛍️</div>
              <div className="font-medium text-stone-900">{p.title}</div>
              {p.description && <div className="mt-1 line-clamp-2 text-sm text-stone-500">{p.description}</div>}
            </Link>
            <div className="mt-4 flex items-center justify-between">
              <span className="font-semibold text-stone-900">{v ? money(v.priceMinor, v.currency) : '—'}</span>
              {v && (
                <button
                  onClick={() => addToCart(v.id, 1)}
                  className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
                >
                  Add to cart
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
