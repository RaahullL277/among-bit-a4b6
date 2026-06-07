import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, money, STORE_ID } from '../api';
import { useCart } from '../cart';
import Stars from '../Stars';
import TrustBar from '../TrustBar';
import { SkeletonGrid } from '../Skeleton';

export default function Shop() {
  const { addToCart } = useCart();
  const [params, setParams] = useSearchParams();
  const [facets, setFacets] = useState(null);
  const [products, setProducts] = useState(null);
  const [ratings, setRatings] = useState({});

  const collection = params.get('collection') || '';
  const brand = params.get('brand') || '';
  const sort = params.get('sort') || 'newest';

  useEffect(() => {
    api.facets(STORE_ID).then(setFacets).catch(() => setFacets(null));
  }, []);

  useEffect(() => {
    setProducts(null);
    api.catalog(STORE_ID, { collection, brand, sort }).then((list) => {
      setProducts(list);
      api.reviewSummaries(STORE_ID, list.map((x) => x.id)).then(setRatings).catch(() => undefined);
    }).catch(() => setProducts([]));
  }, [collection, brand, sort]);

  const set = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next);
  };

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-4 text-xl font-semibold text-stone-900">Shop</h1>
      <TrustBar />

      {/* Category strip */}
      {facets?.collections?.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button onClick={() => set('collection', '')} className={`rounded-full px-3 py-1 text-sm ${!collection ? 'bg-stone-900 text-white' : 'border border-stone-300 text-stone-600'}`}>All</button>
          {facets.collections.map((c) => (
            <button key={c.handle} onClick={() => set('collection', c.handle)} className={`rounded-full px-3 py-1 text-sm ${collection === c.handle ? 'bg-stone-900 text-white' : 'border border-stone-300 text-stone-600'}`}>{c.title}</button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-3">
        {facets?.brands?.length > 0 && (
          <select value={brand} onChange={(e) => set('brand', e.target.value)} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm">
            <option value="">All brands</option>
            {facets.brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
        <select value={sort} onChange={(e) => set('sort', e.target.value)} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm">
          <option value="newest">Newest</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
          <option value="title">Name</option>
        </select>
      </div>

      {!products ? (
        <SkeletonGrid />
      ) : !products.length ? (
        <p className="text-stone-500">No products match.</p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <div key={p.id} className="flex flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <Link to={`/product/${p.id}`} className="flex-1">
                <div className="mb-3 flex h-40 items-center justify-center overflow-hidden rounded-xl bg-stone-100">
                  {p.imageUrl ? <img src={p.imageUrl} alt={p.title} className="h-full w-full object-cover" /> : <span className="text-3xl">🛍️</span>}
                </div>
                <div className="font-medium text-stone-900">{p.title}</div>
                {p.brand && <div className="text-xs text-stone-400">{p.brand}</div>}
                {ratings[p.id]?.count > 0 && (
                  <div className="mt-1 flex items-center gap-1"><Stars value={ratings[p.id].average} size={12} /><span className="text-xs text-stone-400">({ratings[p.id].count})</span></div>
                )}
              </Link>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-semibold text-stone-900">{p.priceMinor != null ? money(p.priceMinor, p.currency) : '—'}</span>
                <Link to={`/product/${p.id}`} className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700">View</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
