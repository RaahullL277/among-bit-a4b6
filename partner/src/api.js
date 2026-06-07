// Partner portal client. Auth is a partner session token (pts_).

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const TOKEN_KEY = 'acp.partnerToken';

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
    requestLink: (email) => req('/partner/auth/request-link', { method: 'POST', body: { email } }),
    verify: (token) => req('/partner/auth/verify', { method: 'POST', body: { token } }),
    oauth: (body) => req('/partner/auth/oauth', { method: 'POST', body }),
    verifyTwoFactor: (challengeToken, code) => req('/partner/auth/2fa/verify', { method: 'POST', body: { challengeToken, code } }),
    setup2fa: () => req('/partner/auth/2fa/setup', { method: 'POST' }),
    enable2fa: (code) => req('/partner/auth/2fa/enable', { method: 'POST', body: { code } }),
    disable2fa: (code) => req('/partner/auth/2fa/disable', { method: 'POST', body: { code } }),
    me: () => req('/partner/auth/me'),
    logout: (token) => req('/partner/auth/logout', { method: 'POST', body: { token } }),
  },
  dashboard: (from) => req(`/partner/dashboard?${qs({ from })}`),
  clients: (from) => req(`/partner/clients?${qs({ from })}`),
  createClient: (body) => req('/partner/clients', { method: 'POST', body }),
  updateClient: (clientId, body) => req(`/partner/clients/${clientId}`, { method: 'PATCH', body }),
  removeClient: (clientId) => req(`/partner/clients/${clientId}`, { method: 'DELETE' }),
  renewals: (withinDays) => req(`/partner/renewals?${qs({ withinDays })}`),
};

export function money(minor, currency = 'INR') {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format((minor ?? 0) / 100);
  } catch {
    return `₹${Math.round((minor ?? 0) / 100)}`;
  }
}

export { BASE_URL };
