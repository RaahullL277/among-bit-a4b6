import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, X } from 'lucide-react';
import { api, money, STORE_ID } from '../api';

const EMAIL_KEY = 'shopper.email';

export default function Wishlist() {
  const [email, setEmail] = useState(localStorage.getItem(EMAIL_KEY) ?? '');
  const [active, setActive] = useState(Boolean(localStorage.getItem(EMAIL_KEY)));
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  async function load(e) {
    if (!e) return;
    setLoading(true);
    try { setItems(await api.wishlist(STORE_ID, e)); } catch { setItems([]); } finally { setLoading(false); }
  }

  useEffect(() => { if (active && email) load(email); }, [active]);

  function start(e) {
    e.preventDefault();
    if (!email.trim()) return;
    localStorage.setItem(EMAIL_KEY, email.trim());
    setActive(true);
  }

  async function remove(productId) {
    await api.removeWishlist(STORE_ID, { email, productId });
    load(email);
  }

  if (!active) {
    return (
      <div className="mx-auto max-w-sm text-center">
        <Heart className="mx-auto text-stone-300" size={28} />
        <h1 className="mt-2 text-lg font-semibold text-stone-900">Your wishlist</h1>
        <p className="mt-1 text-sm text-stone-500">Enter your email to see items you’ve saved.</p>
        <form onSubmit={start} className="mt-4 space-y-3">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
          <button disabled={!email.trim()} className="w-full rounded-lg bg-stone-900 px-4 py-2 font-medium text-white disabled:opacity-50">View wishlist</button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-stone-900">Your wishlist</h1>
        <button onClick={() => { localStorage.removeItem(EMAIL_KEY); setActive(false); setItems([]); }} className="text-xs text-stone-400 hover:text-stone-600">Use a different email</button>
      </div>
      {loading ? (
        <p className="mt-6 text-sm text-stone-400">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-6 text-sm text-stone-500">Nothing saved yet. Tap the heart on a product to add it.</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
          {items.map((p) => (
            <div key={p.productId} className="relative rounded-xl border border-stone-200 p-4">
              <button onClick={() => remove(p.productId)} title="Remove" className="absolute right-2 top-2 rounded p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-600"><X size={14} /></button>
              <Link to={`/product/${p.productId}`}>
                <div className="text-sm font-medium text-stone-900">{p.title}</div>
                <div className="mt-2 font-semibold text-stone-900">{p.priceMinor != null ? money(p.priceMinor, p.currency) : '—'}</div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
