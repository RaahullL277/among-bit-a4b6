import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, money, STORE_ID } from '../api';

export default function Search() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    api.search(STORE_ID, q).then(setResults).catch(() => setResults([])).finally(() => setLoading(false));
  }, [q]);

  return (
    <div>
      <h1 className="text-lg font-semibold text-stone-900">
        {q ? <>Results for “{q}”</> : 'Search'}
      </h1>
      {loading ? (
        <p className="mt-6 text-sm text-stone-400">Searching…</p>
      ) : !q ? (
        <p className="mt-2 text-sm text-stone-500">Type in the search box above to find products.</p>
      ) : results.length === 0 ? (
        <p className="mt-6 text-sm text-stone-500">No products matched “{q}”.</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
          {results.map((p) => (
            <Link key={p.id} to={`/product/${p.id}`} className="rounded-xl border border-stone-200 p-4 hover:border-stone-300">
              <div className="text-sm font-medium text-stone-900">{p.title}</div>
              {p.description && <p className="mt-1 line-clamp-2 text-xs text-stone-500">{p.description}</p>}
              <div className="mt-2 font-semibold text-stone-900">{p.priceMinor != null ? money(p.priceMinor, p.currency) : '—'}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
