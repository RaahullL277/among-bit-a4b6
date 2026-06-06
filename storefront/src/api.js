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
  product: (id, pid) => req(`/storefront/${id}/products/${pid}`),
  createCart: (id, body) => req(`/storefront/${id}/carts`, { method: 'POST', body }),
  getCart: (cid) => req(`/storefront/carts/${cid}`),
  addItem: (cid, body) => req(`/storefront/carts/${cid}/items`, { method: 'POST', body }),
  checkout: (cid, body) => req(`/storefront/carts/${cid}/checkout`, { method: 'POST', body }),
  supportConfig: (id) => req(`/storefront/${id}/support/config`),
  supportChat: (id, body) => req(`/storefront/${id}/support/chat`, { method: 'POST', body }),
  productReviews: (id, pid) => req(`/storefront/${id}/products/${pid}/reviews`),
  submitReview: (id, pid, body) => req(`/storefront/${id}/products/${pid}/reviews`, { method: 'POST', body }),
  reviewSummaries: (id, productIds) =>
    req(`/storefront/${id}/reviews/summary${productIds ? `?productIds=${productIds.join(',')}` : ''}`),
  productBundles: (id, pid) => req(`/storefront/${id}/products/${pid}/bundles`),
  frequentlyBoughtTogether: (id, pid) => req(`/storefront/${id}/products/${pid}/frequently-bought-together`),
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
};

export function money(minor, currency = 'INR') {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format((minor ?? 0) / 100);
  } catch {
    return `${currency} ${((minor ?? 0) / 100).toFixed(2)}`;
  }
}
