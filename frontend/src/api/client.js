// Thin REST client for the ACP API. The merchant API key is stored in
// localStorage and sent as `x-api-key` on every request.

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const KEY_STORAGE = 'acp.apiKey';

export function getApiKey() {
  return localStorage.getItem(KEY_STORAGE) ?? '';
}

export function setApiKey(key) {
  if (key) localStorage.setItem(KEY_STORAGE, key);
  else localStorage.removeItem(KEY_STORAGE);
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': getApiKey(),
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
  // Auth probe — any authenticated GET works to validate a key.
  validateKey: () => request('/stores'),

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
