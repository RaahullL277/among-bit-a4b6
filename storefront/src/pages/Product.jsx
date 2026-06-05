import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, money, STORE_ID } from '../api';
import { useCart } from '../cart';

export default function Product() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const [product, setProduct] = useState(null);
  const [qty, setQty] = useState(1);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api.product(STORE_ID, id).then(setProduct).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className="text-rose-600">{error}</p>;
  if (!product) return <p className="text-stone-500">Loading…</p>;
  const v = product.variants?.[0];

  async function add(goToCart) {
    setAdding(true);
    try {
      await addToCart(v.id, qty);
      if (goToCart) navigate('/cart');
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

        <div className="mt-5 flex items-center gap-3">
          <input
            type="number"
            min="1"
            value={qty}
            onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="w-20 rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
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
        </div>
      </div>
    </div>
  );
}
