import { useEffect, useState } from 'react';
import { Routes, Route, Link, Navigate } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import { api, STORE_ID, setStoreId } from './api';
import { trackLand } from './track';
import ChatWidget from './ChatWidget';
import { CartProvider, useCart } from './cart';
import Home from './pages/Home';
import Product from './pages/Product';
import Cart from './pages/Cart';
import Confirmation from './pages/Confirmation';
import Returns from './pages/Returns';
import Subscriptions from './pages/Subscriptions';

function Header({ storeName }) {
  const { itemCount } = useCart();
  return (
    <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-lg font-semibold text-[var(--brand)]">{storeName || 'Store'}</Link>
        <div className="flex items-center gap-4">
        <Link to="/subscriptions" className="text-sm text-stone-500 hover:text-stone-800">Subscriptions</Link>
        <Link to="/returns" className="text-sm text-stone-500 hover:text-stone-800">Returns</Link>
        <Link to="/cart" className="relative inline-flex items-center gap-1.5 text-stone-700 hover:text-stone-900">
          <ShoppingCart size={20} />
          {itemCount > 0 && (
            <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-stone-900 px-1 text-[10px] font-semibold text-white">
              {itemCount}
            </span>
          )}
        </Link>
        </div>
      </div>
    </header>
  );
}

function StoreGate() {
  const [id, setId] = useState('');
  return (
    <div className="mx-auto mt-20 max-w-sm px-4 text-center">
      <h1 className="text-lg font-semibold text-stone-900">Open a store</h1>
      <p className="mt-1 text-sm text-stone-500">Enter a store id (or pass <code>?store=…</code> in the URL).</p>
      <input
        value={id}
        onChange={(e) => setId(e.target.value)}
        placeholder="store id"
        className="mt-4 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
      />
      <button
        onClick={() => {
          setStoreId(id.trim());
          window.location.href = '/';
        }}
        disabled={!id.trim()}
        className="mt-3 w-full rounded-lg bg-stone-900 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        Open store
      </button>
    </div>
  );
}

// Apply the store theme as CSS variables the storefront reads (--brand, --accent).
function applyTheme(theme) {
  const root = document.documentElement;
  root.style.setProperty('--brand', theme?.primaryColor || '#1c1917');
  root.style.setProperty('--accent', theme?.accentColor || '#4f46e5');
}

export default function App() {
  const [storeName, setStoreName] = useState('');
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!STORE_ID) {
      setMissing(true);
      return;
    }
    api.store(STORE_ID).then((s) => setStoreName(s.name)).catch(() => setMissing(true));
    api.theme(STORE_ID).then((t) => {
      applyTheme(t);
      if (t?.logoText) setStoreName(t.logoText);
    }).catch(() => undefined);
    trackLand(); // capture acquisition attribution + landing
  }, []);

  if (missing) return <StoreGate />;

  return (
    <CartProvider>
      <Header storeName={storeName} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/product/:id" element={<Product />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/confirmation" element={<Confirmation />} />
          <Route path="/returns" element={<Returns />} />
          <Route path="/subscriptions" element={<Subscriptions />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <ChatWidget />
    </CartProvider>
  );
}
