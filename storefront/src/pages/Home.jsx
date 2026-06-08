import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, STORE_ID } from '../api';
import { useCart } from '../cart';
import Stars from '../Stars';
import PageRenderer from '../PageRenderer';
import TrustBar from '../TrustBar';
import RecentlyViewed from '../RecentlyViewed';
import { SkeletonGrid } from '../Skeleton';
import { useHomeExperience } from '../experiment';

export default function Home() {
  const { addToCart } = useCart();
  const homeExp = useHomeExperience(); // resolved A/B / cohort variant (or null)
  const [page, setPage] = useState(undefined); // undefined = loading, null = none
  const [products, setProducts] = useState(null);
  const [ratings, setRatings] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    // If an experiment assigned this visitor a home variant, render it.
    if (homeExp?.page?.sections?.length) { setPage(homeExp.page); return; }
    // Else prefer a merchant-designed published "home" page; fall back to the catalog grid.
    api.page(STORE_ID, 'home')
      .then((p) => {
        setPage(p);
        if (p) return;
        return api.products(STORE_ID).then((list) => {
          setProducts(list);
          api.reviewSummaries(STORE_ID, list.map((x) => x.id)).then(setRatings).catch(() => undefined);
        });
      })
      .catch((e) => setError(e.message));
  }, [homeExp]);

  if (error) return <p className="text-rose-600">{error}</p>;
  if (page === undefined) return <div><TrustBar /><SkeletonGrid /></div>;
  if (page) return <PageRenderer page={page} />;
  if (!products) return <div><TrustBar /><SkeletonGrid /></div>;
  if (!products.length) return <p className="text-stone-500">No products available.</p>;

  return (
    <div>
    <TrustBar />
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((p) => {
        const v = p.variants?.[0];
        return (
          <div key={p.id} className="flex flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <Link to={`/product/${p.id}`} className="flex-1">
              <div className="mb-3 flex h-40 items-center justify-center overflow-hidden rounded-xl bg-stone-100">
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt={p.title} className="h-full w-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                ) : (
                  <span className="text-3xl">🛍️</span>
                )}
              </div>
              <div className="font-medium text-stone-900">{p.title}</div>
              {ratings[p.id]?.count > 0 && (
                <div className="mt-1 flex items-center gap-1">
                  <Stars value={ratings[p.id].average} size={13} />
                  <span className="text-xs text-stone-400">({ratings[p.id].count})</span>
                </div>
              )}
              {p.description && <div className="mt-1 line-clamp-2 text-sm text-stone-500">{p.description}</div>}
              {v?.availability === 'out_of_stock' && <span className="mt-1 inline-block rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-500">Out of stock</span>}
              {v?.availability === 'low_stock' && <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Low stock</span>}
            </Link>
            <div className="mt-4 flex items-center justify-between">
              <span className="font-semibold text-stone-900">
                {v ? money(v.priceMinor, v.currency) : '—'}
                {v?.compareAtMinor > v?.priceMinor && <span className="ml-1.5 text-xs font-normal text-stone-400 line-through">{money(v.compareAtMinor, v.currency)}</span>}
              </span>
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
    <RecentlyViewed />
    </div>
  );
}
