// Thin REST client for the ACP API. The auth token (a user session token or an
// API key) is stored in localStorage and sent as `Authorization: Bearer` on
// every request — the API guard accepts either form.

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const TOKEN_STORAGE = 'acp.token';
// When a partner is managing a client store, we authenticate with their partner
// token and name the client tenant via the x-acp-client header.
const CLIENT_STORAGE = 'acp.actingClient'; // { tenantId, name }

export function getToken() {
  return localStorage.getItem(TOKEN_STORAGE) ?? '';
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_STORAGE, token);
  else localStorage.removeItem(TOKEN_STORAGE);
}

export function getActingClient() {
  try {
    return JSON.parse(localStorage.getItem(CLIENT_STORAGE) ?? 'null');
  } catch {
    return null;
  }
}

export function setActingClient(client) {
  if (client) localStorage.setItem(CLIENT_STORAGE, JSON.stringify(client));
  else localStorage.removeItem(CLIENT_STORAGE);
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
  const acting = getActingClient();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    signal,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(acting?.tenantId ? { 'x-acp-client': acting.tenantId } : {}),
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
    list: (storeId, search, segment) => request(`/customers?${qs({ storeId, search, segment })}`),
    summary: (storeId) => request(`/customers/summary?${qs({ storeId })}`),
    create: (body) => request('/customers', { method: 'POST', body }),
    profile: (id) => request(`/customers/${id}/profile`),
    update: (id, body) => request(`/customers/${id}`, { method: 'PATCH', body }),
    cohorts: (id) => request(`/customers/${id}/cohorts`),
    recommendations: (id) => request(`/customers/${id}/recommendations`),
    setConsent: (id, consent) => request(`/customers/${id}/consent`, { method: 'PATCH', body: { consent } }),
  },
  cohorts: {
    list: (storeId) => request(`/cohorts?${qs({ storeId })}`),
    schedule: (storeId) => request(`/cohorts/schedule?${qs({ storeId })}`),
    recompute: (storeId) => request('/cohorts/recompute', { method: 'POST', body: { storeId } }),
  },
  shopability: {
    get: (storeId) => request(`/shopability?${qs({ storeId })}`),
    update: (body) => request('/shopability', { method: 'PUT', body }),
    setChannel: (storeId, channel, enabled) => request('/shopability/channel', { method: 'PUT', body: { storeId, channel, enabled } }),
    agentCheckouts: (storeId) => request(`/shopability/agent-checkouts?${qs({ storeId })}`),
  },
  engagement: {
    library: () => request('/engagement/library'),
    templates: (trigger, channel) => request(`/engagement/templates?${qs({ trigger, channel })}`),
    campaigns: (storeId) => request(`/engagement/campaigns?${qs({ storeId })}`),
    setCampaign: (body) => request('/engagement/campaigns', { method: 'PUT', body }),
    setupDefaults: (storeId, channel) => request('/engagement/setup-defaults', { method: 'POST', body: { storeId, channel } }),
    getPolicy: (storeId) => request(`/engagement/policy?${qs({ storeId })}`),
    setPolicy: (body) => request('/engagement/policy', { method: 'PUT', body }),
    preview: (body) => request('/engagement/preview', { method: 'POST', body }),
    run: (storeId, dryRun, triggers) => request('/engagement/run', { method: 'POST', body: { storeId, dryRun, triggers } }),
    log: (storeId, limit) => request(`/engagement/log?${qs({ storeId, limit })}`),
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
  design: {
    listPages: (storeId) => request(`/pages?${qs({ storeId })}`),
    getPage: (id) => request(`/pages/${id}`),
    createPage: (body) => request('/pages', { method: 'POST', body }),
    updatePage: (id, body) => request(`/pages/${id}`, { method: 'PATCH', body }),
    setPageStatus: (id, status) => request(`/pages/${id}/status`, { method: 'POST', body: { status } }),
    removePage: (id) => request(`/pages/${id}`, { method: 'DELETE' }),
    getTheme: (storeId) => request(`/theme?${qs({ storeId })}`),
    setTheme: (body) => request('/theme', { method: 'PUT', body }),
    templates: (category) => request(`/templates?${qs({ category })}`),
    applyTemplate: (body) => request('/templates/apply', { method: 'POST', body }),
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
    setPackingVideo: (id, url) => request(`/shipments/${id}/packing-video`, { method: 'POST', body: { url } }),
  },
  returns: {
    list: (storeId, status) => request(`/returns?${qs({ storeId, status })}`),
    counts: (storeId) => request(`/returns/counts?${qs({ storeId })}`),
    get: (id) => request(`/returns/${id}`),
    approve: (id, note) => request(`/returns/${id}/approve`, { method: 'POST', body: { note } }),
    reject: (id, note) => request(`/returns/${id}/reject`, { method: 'POST', body: { note } }),
    receive: (id) => request(`/returns/${id}/receive`, { method: 'POST' }),
    refund: (id, amountMinor) => request(`/returns/${id}/refund`, { method: 'POST', body: { amountMinor } }),
    getPolicy: (storeId) => request(`/returns/policy?${qs({ storeId })}`),
    setPolicy: (body) => request('/returns/policy', { method: 'PUT', body }),
  },
  loyalty: {
    getProgram: (storeId) => request(`/loyalty/program?${qs({ storeId })}`),
    setProgram: (body) => request('/loyalty/program', { method: 'PUT', body }),
    accounts: (storeId) => request(`/loyalty/accounts?${qs({ storeId })}`),
    adjust: (customerId, body) => request(`/loyalty/accounts/${customerId}/adjust`, { method: 'POST', body }),
  },
  subscriptions: {
    list: (storeId, status) => request(`/subscriptions?${qs({ storeId, status })}`),
    counts: (storeId) => request(`/subscriptions/counts?${qs({ storeId })}`),
    getSettings: (storeId) => request(`/subscriptions/settings?${qs({ storeId })}`),
    setSettings: (body) => request('/subscriptions/settings', { method: 'PUT', body }),
    setStatus: (id, status) => request(`/subscriptions/${id}/status`, { method: 'POST', body: { status } }),
    runBilling: () => request('/subscriptions/run-billing', { method: 'POST' }),
  },
  seo: {
    getSettings: (storeId) => request(`/seo/settings?${qs({ storeId })}`),
    setSettings: (body) => request('/seo/settings', { method: 'PUT', body }),
    audit: (storeId) => request(`/seo/audit?${qs({ storeId })}`),
  },
  images: {
    list: (storeId, productId) => request(`/images?${qs({ storeId, productId })}`),
    savings: (storeId) => request(`/images/savings?${qs({ storeId })}`),
    create: (body) => request('/images', { method: 'POST', body }),
    optimize: (id) => request(`/images/${id}/optimize`, { method: 'POST' }),
    optimizeAll: (storeId) => request('/images/optimize-all', { method: 'POST', body: { storeId } }),
    setAlt: (id, body) => request(`/images/${id}/alt`, { method: 'POST', body }),
    remove: (id) => request(`/images/${id}`, { method: 'DELETE' }),
  },
  analytics: {
    summary: (storeId, from) => request(`/analytics/summary?${qs({ storeId, from })}`),
    revenue: (storeId, from, interval) => request(`/analytics/revenue?${qs({ storeId, from, interval })}`),
    funnel: (storeId, from) => request(`/analytics/funnel?${qs({ storeId, from })}`),
    topProducts: (storeId, from, limit) => request(`/analytics/top-products?${qs({ storeId, from, limit })}`),
    agentSales: (storeId, from) => request(`/analytics/agent-sales?${qs({ storeId, from })}`),
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
  audit: {
    list: (params) => request(`/audit?${qs(params ?? {})}`),
  },
  apps: {
    catalog: () => request('/apps/catalog'),
    installed: () => request('/apps/installed'),
    install: (id, config) => request(`/apps/${id}/install`, { method: 'POST', body: { config } }),
    setEnabled: (id, enabled) => request(`/apps/${id}`, { method: 'PATCH', body: { enabled } }),
    uninstall: (id) => request(`/apps/${id}/install`, { method: 'DELETE' }),
  },
  apiKeys: {
    list: () => request('/api-keys'),
    create: (body) => request('/api-keys', { method: 'POST', body }),
    revoke: (id) => request(`/api-keys/${id}`, { method: 'DELETE' }),
  },
  partnerAccess: {
    get: () => request('/partner-access'),
    set: (accessLevel) => request('/partner-access', { method: 'PUT', body: { accessLevel } }),
  },
  pricing: {
    getRule: (storeId) => request(`/pricing/rule?${qs({ storeId })}`),
    setRule: (body) => request('/pricing/rule', { method: 'PUT', body }),
    analyze: (storeId) => request(`/pricing/analyze?${qs({ storeId })}`),
    reprice: (storeId, apply) => request('/pricing/reprice', { method: 'POST', body: { storeId, apply } }),
    refresh: (storeId) => request('/pricing/refresh', { method: 'POST', body: { storeId } }),
    setCost: (variantId, costMinor) => request(`/pricing/variants/${variantId}/cost`, { method: 'PUT', body: { costMinor } }),
    addCompetitor: (body) => request('/pricing/competitors', { method: 'POST', body }),
    removeCompetitor: (id) => request(`/pricing/competitors/${id}`, { method: 'DELETE' }),
  },
};

export { BASE_URL };
