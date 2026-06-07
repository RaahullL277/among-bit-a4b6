import { useEffect, useState } from 'react';
import { api, STORE_ID } from './api';
import { readIds } from './recently';
import ProductRail from './ProductRail';

/**
 * "Recently viewed" rail. Resolves the recorded product ids against the active
 * catalog (so out-of-stock/removed items drop off), optionally excluding the
 * product currently on screen.
 */
export default function RecentlyViewed({ excludeId, title = 'Recently viewed' }) {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    const ids = readIds().filter((id) => id !== excludeId);
    if (!ids.length) return;
    api.products(STORE_ID)
      .then((list) => {
        const byId = new Map(list.map((p) => [p.id, p]));
        setProducts(ids.map((id) => byId.get(id)).filter(Boolean).slice(0, 8));
      })
      .catch(() => undefined);
  }, [excludeId]);

  return <ProductRail title={title} products={products} />;
}
