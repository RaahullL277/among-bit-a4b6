// Thin REST client for the ACP API. The auth token (a user session token or an
// API key) is stored in localStorage and sent as `Authorization: Bearer` on
// every request — the API guard accepts either form.

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const TOKEN_STORAGE = 'acp.token';

export function getToken() {
  return localStorage.getItem(TOKEN_STORAGE) ?? '';
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_STORAGE, token);
  else localStorage.removeItem(TOKEN_STORAGE);
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Build a query string from defined params only.
function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, v);
  }
  return p.toString();
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    signal,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(data?.error ?? res.statusText, res.status);
  }
  return data;
}

// Resource helpers ---------------------------------------------------------
export const api = {
  auth: {
    requestLink: (email) => request('/auth/request-link', { method: 'POST', body: { email } }),
    verify: (token) => request('/auth/verify', { method: 'POST', body: { token } }),
    signup: (body) => request('/auth/signup', { method: 'POST', body }),
    acceptInvite: (token, name) =>
      request('/auth/accept-invite', { method: 'POST', body: { token, name } }),
    me: () => request('/auth/me'),
    logout: (token) => request('/auth/logout', { method: 'POST', body: { token } }),
  },
  members: {
    list: () => request('/members'),
    changeRole: (userId, role) => request(`/members/${userId}`, { method: 'PATCH', body: { role } }),
    remove: (userId) => request(`/members/${userId}`, { method: 'DELETE' }),
    listInvites: () => request('/invites'),
    createInvite: (body) => request('/invites', { method: 'POST', body }),
    revokeInvite: (id) => request(`/invites/${id}`, { method: 'DELETE' }),
  },

  stores: {
    list: () => request('/stores'),
    get: (id) => request(`/stores/${id}`),
    create: (body) => request('/stores', { method: 'POST', body }),
    update: (id, body) => request(`/stores/${id}`, { method: 'PATCH', body }),
  },
  products: {
    list: (storeId) => request(`/products?storeId=${encodeURIComponent(storeId)}`),
    create: (body) => request('/products', { method: 'POST', body }),
    update: (id, body) => request(`/products/${id}`, { method: 'PATCH', body }),
  },
  customers: {
    list: (storeId) => request(`/customers?storeId=${encodeURIComponent(storeId)}`),
    create: (body) => request('/customers', { method: 'POST', body }),
  },
  orders: {
    list: (storeId) => request(storeId ? `/orders?storeId=${encodeURIComponent(storeId)}` : '/orders'),
    get: (id) => request(`/orders/${id}`),
    updateStatus: (id, status) => request(`/orders/${id}/status`, { method: 'PATCH', body: { status } }),
  },
  integrations: {
    list: (storeId) => request(`/integrations?storeId=${encodeURIComponent(storeId)}`),
    configure: (body) => request('/integrations', { method: 'POST', body }),
  },
  messaging: {
    send: (body) => request('/messaging/send', { method: 'POST', body }),
  },
  reviews: {
    list: (storeId, status, productId) => request(`/reviews?${qs({ storeId, status, productId })}`),
    counts: (storeId) => request(`/reviews/counts?${qs({ storeId })}`),
    moderate: (id, status) => request(`/reviews/${id}/moderate`, { method: 'POST', body: { status } }),
    reply: (id, body) => request(`/reviews/${id}/reply`, { method: 'POST', body: { body } }),
  },
  marketing: {
    providers: (storeId) => request(`/marketing/providers?${qs({ storeId })}`),
    sync: (storeId) => request(`/marketing/sync?${qs({ storeId })}`, { method: 'POST' }),
  },
  bundles: {
    list: (storeId) => request(`/bundles?${qs({ storeId })}`),
    suggestions: (storeId, productId) => request(`/bundles/suggestions?${qs({ storeId, productId })}`),
    create: (body) => request('/bundles', { method: 'POST', body }),
    update: (id, body) => request(`/bundles/${id}`, { method: 'PATCH', body }),
    remove: (id) => request(`/bundles/${id}`, { method: 'DELETE' }),
  },
  support: {
    getConfig: (storeId) => request(`/support/bot-config?${qs({ storeId })}`),
    setConfig: (body) => request('/support/bot-config', { method: 'PUT', body }),
    conversations: (storeId, status) => request(`/support/conversations?${qs({ storeId, status })}`),
    conversation: (id) => request(`/support/conversations/${id}`),
    reply: (id, body) => request(`/support/conversations/${id}/reply`, { method: 'POST', body: { body } }),
    setStatus: (id, status) => request(`/support/conversations/${id}/status`, { method: 'POST', body: { status } }),
  },
  shipments: {
    list: (storeId, status) => request(`/shipments?${qs({ storeId, status })}`),
    get: (id) => request(`/shipments/${id}`),
    create: (body) => request('/shipments', { method: 'POST', body }),
    cancel: (id) => request(`/shipments/${id}/cancel`, { method: 'POST' }),
  },
  analytics: {
    summary: (storeId, from) => request(`/analytics/summary?${qs({ storeId, from })}`),
    revenue: (storeId, from, interval) => request(`/analytics/revenue?${qs({ storeId, from, interval })}`),
    funnel: (storeId, from) => request(`/analytics/funnel?${qs({ storeId, from })}`),
    topProducts: (storeId, from, limit) => request(`/analytics/top-products?${qs({ storeId, from, limit })}`),
  },
  stock: {
    status: (storeId) => request(`/stores/${storeId}/stock`),
    getPolicy: (storeId) => request(`/stock-policy?storeId=${encodeURIComponent(storeId)}`),
    setPolicy: (body) => request('/stock-policy', { method: 'PUT', body }),
    recompute: () => request('/stock/recompute', { method: 'POST' }),
  },
  carts: {
    list: (storeId, status) =>
      request(
        `/carts?storeId=${encodeURIComponent(storeId)}${status ? `&status=${status}` : ''}`,
      ),
    getPolicy: (storeId) => request(`/cart-recovery-policy?storeId=${encodeURIComponent(storeId)}`),
    setPolicy: (body) => request('/cart-recovery-policy', { method: 'PUT', body }),
    runRecovery: () => request('/carts/run-recovery', { method: 'POST' }),
  },
  notifications: {
    list: (storeId) => request(`/notifications?storeId=${encodeURIComponent(storeId)}`),
    listPreferences: (storeId) =>
      request(`/notification-preferences?storeId=${encodeURIComponent(storeId)}`),
    setPreference: (body) => request('/notification-preferences', { method: 'PUT', body }),
  },
  apiKeys: {
    list: () => request('/api-keys'),
    create: (body) => request('/api-keys', { method: 'POST', body }),
    revoke: (id) => request(`/api-keys/${id}`, { method: 'DELETE' }),
  },
};

export { BASE_URL };
