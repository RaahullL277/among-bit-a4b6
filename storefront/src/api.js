// Public storefront client — no auth, scoped to a single store id.

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

// Store id from ?store=, else env, else a value the shopper entered earlier.
const params = new URLSearchParams(window.location.search);
if (params.get('store')) localStorage.setItem('store.id', params.get('store'));
export const STORE_ID =
  localStorage.getItem('store.id') || import.meta.env.VITE_STORE_ID || '';

export function setStoreId(id) {
  localStorage.setItem('store.id', id);
}

async function req(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error ?? res.statusText);
  return data;
}

export const api = {
  store: (id) => req(`/storefront/${id}`),
  products: (id) => req(`/storefront/${id}/products`),
  search: (id, q) => req(`/storefront/${id}/search?q=${encodeURIComponent(q)}`),
  collections: (id) => req(`/storefront/${id}/collections`),
  facets: (id) => req(`/storefront/${id}/facets`),
  catalog: (id, params = {}) => {
    const qsv = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v != null && v !== '') qsv.set(k, Array.isArray(v) ? v.join(',') : v);
    return req(`/storefront/${id}/catalog?${qsv.toString()}`);
  },
  resolveVariant: (id, productId, selected) => req(`/storefront/${id}/products/${productId}/resolve-variant`, { method: 'POST', body: { selected } }),
  trackOrder: (id, number, email) =>
    req(`/storefront/${id}/track?number=${encodeURIComponent(number)}&email=${encodeURIComponent(email)}`),
  // Direct URL to the buyer's printable GST tax invoice (verified by number + email).
  invoiceUrl: (id, number, email) =>
    `${BASE_URL}/storefront/${id}/invoice.html?number=${encodeURIComponent(number)}&email=${encodeURIComponent(email)}`,
  legalPolicies: (id) => req(`/storefront/${id}/legal`),
  legalPolicy: (id, type) => req(`/storefront/${id}/legal/${encodeURIComponent(type)}`),
  returnPolicy: (id) => req(`/storefront/${id}/return-policy`),
  cancelOrder: (id, body) => req(`/storefront/${id}/cancel-order`, { method: 'POST', body }),
  wishlist: (id, email) => req(`/storefront/${id}/wishlist?email=${encodeURIComponent(email)}`),
  addWishlist: (id, body) => req(`/storefront/${id}/wishlist`, { method: 'POST', body }),
  removeWishlist: (id, body) => req(`/storefront/${id}/wishlist/remove`, { method: 'POST', body }),
  product: (id, pid) => req(`/storefront/${id}/products/${pid}`),
  createCart: (id, body) => req(`/storefront/${id}/carts`, { method: 'POST', body }),
  getCart: (cid) => req(`/storefront/carts/${cid}`),
  addItem: (cid, body) => req(`/storefront/carts/${cid}/items`, { method: 'POST', body }),
  setItemQty: (cid, variantId, quantity) => req(`/storefront/carts/${cid}/items/${variantId}`, { method: 'PATCH', body: { quantity } }),
  removeItem: (cid, variantId) => req(`/storefront/carts/${cid}/items/${variantId}`, { method: 'DELETE' }),
  checkout: (cid, body) => req(`/storefront/carts/${cid}/checkout`, { method: 'POST', body }),
  checkoutQuote: (cid) => req(`/storefront/carts/${cid}/quote`),
  supportConfig: (id) => req(`/storefront/${id}/support/config`),
  supportChat: (id, body) => req(`/storefront/${id}/support/chat`, { method: 'POST', body }),
  productReviews: (id, pid) => req(`/storefront/${id}/products/${pid}/reviews`),
  submitReview: (id, pid, body) => req(`/storefront/${id}/products/${pid}/reviews`, { method: 'POST', body }),
  reviewSummaries: (id, productIds) =>
    req(`/storefront/${id}/reviews/summary${productIds ? `?productIds=${productIds.join(',')}` : ''}`),
  productBundles: (id, pid) => req(`/storefront/${id}/products/${pid}/bundles`),
  frequentlyBoughtTogether: (id, pid) => req(`/storefront/${id}/products/${pid}/frequently-bought-together`),
  track: (id, body) => req(`/storefront/${id}/track`, { method: 'POST', body }),
  theme: (id) => req(`/storefront/${id}/theme`),
  page: (id, slug) => req(`/storefront/${id}/pages/${slug}`),
  orderLookup: (id, number, email) =>
    req(`/storefront/${id}/order-lookup?number=${encodeURIComponent(number)}&email=${encodeURIComponent(email)}`),
  requestReturn: (id, body) => req(`/storefront/${id}/returns`, { method: 'POST', body }),
  loyalty: (id, email) => req(`/storefront/${id}/loyalty?email=${encodeURIComponent(email)}`),
  subscriptionSettings: (id) => req(`/storefront/${id}/subscription-settings`),
  subscribe: (id, body) => req(`/storefront/${id}/subscriptions`, { method: 'POST', body }),
  mySubscriptions: (id, email) => req(`/storefront/${id}/subscriptions?email=${encodeURIComponent(email)}`),
  manageSubscription: (id, subId, body) =>
    req(`/storefront/${id}/subscriptions/${subId}/manage`, { method: 'POST', body }),
  productSeo: (id, pid) => req(`/storefront/${id}/products/${pid}/seo`),
};

// Apply SEO meta to the document head (title, description, canonical, JSON-LD).
export function applySeo(seo) {
  if (!seo) return;
  if (seo.title) document.title = seo.title;
  const setMeta = (name, content, attr = 'name') => {
    if (!content) return;
    let el = document.head.querySelector(`meta[${attr}="${name}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  };
  setMeta('description', seo.description);
  setMeta('og:title', seo.title, 'property');
  setMeta('og:description', seo.description, 'property');
  if (seo.indexable === false) setMeta('robots', 'noindex');
  if (seo.jsonLd) {
    let s = document.getElementById('ld-product');
    if (!s) {
      s = document.createElement('script');
      s.type = 'application/ld+json';
      s.id = 'ld-product';
      document.head.appendChild(s);
    }
    s.textContent = JSON.stringify(seo.jsonLd);
  }
}

export function money(minor, currency = 'INR') {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format((minor ?? 0) / 100);
  } catch {
    return `${currency} ${((minor ?? 0) / 100).toFixed(2)}`;
  }
}
