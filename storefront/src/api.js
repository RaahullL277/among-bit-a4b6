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
  checkout: (cid) => req(`/storefront/carts/${cid}/checkout`, { method: 'POST' }),
};

export function money(minor, currency = 'INR') {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format((minor ?? 0) / 100);
  } catch {
    return `${currency} ${((minor ?? 0) / 100).toFixed(2)}`;
  }
}
