// Platform-operator console client. Auth is a platform session token (psa_).

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const TOKEN_KEY = 'acp.platformToken';

export const getToken = () => localStorage.getItem(TOKEN_KEY) ?? '';
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  return p.toString();
}

async function req(path, { method = 'GET', body } = {}) {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error ?? res.statusText);
  return data;
}

export const api = {
  auth: {
    requestLink: (email) => req('/platform/auth/request-link', { method: 'POST', body: { email } }),
    verify: (token) => req('/platform/auth/verify', { method: 'POST', body: { token } }),
    me: () => req('/platform/auth/me'),
    logout: (token) => req('/platform/auth/logout', { method: 'POST', body: { token } }),
  },
  tenants: {
    list: (search, status) => req(`/platform/tenants?${qs({ search, status })}`),
    get: (id) => req(`/platform/tenants/${id}`),
    suspend: (id) => req(`/platform/tenants/${id}/suspend`, { method: 'POST' }),
    reactivate: (id) => req(`/platform/tenants/${id}/reactivate`, { method: 'POST' }),
    getPlan: (id) => req(`/platform/tenants/${id}/plan`),
    setPlan: (id, body) => req(`/platform/tenants/${id}/plan`, { method: 'PUT', body }),
  },
  stores: {
    suspend: (id) => req(`/platform/stores/${id}/suspend`, { method: 'POST' }),
    reactivate: (id) => req(`/platform/stores/${id}/reactivate`, { method: 'POST' }),
  },
  staff: {
    list: () => req('/platform/staff'),
    create: (body) => req('/platform/staff', { method: 'POST', body }),
    changeRole: (id, role) => req(`/platform/staff/${id}`, { method: 'PATCH', body: { role } }),
    remove: (id) => req(`/platform/staff/${id}`, { method: 'DELETE' }),
  },
  audit: (limit) => req(`/platform/audit?${qs({ limit })}`),
  assistant: (messages) => req('/platform/assistant/chat', { method: 'POST', body: { messages } }),
  analytics: {
    overview: (from) => req(`/platform/analytics/overview?${qs({ from })}`),
    topMerchants: (from, limit) => req(`/platform/analytics/top-merchants?${qs({ from, limit })}`),
    growth: (from, interval) => req(`/platform/analytics/growth?${qs({ from, interval })}`),
  },
};

export { BASE_URL };
