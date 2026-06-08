// Lightweight behaviour tracking → feeds cohort intelligence. Captures the
// acquisition attribution (utm_source/campaign/term, e.g. a Meta campaign or a
// Google search term) on first landing, keeps a persistent anonymous visitor id,
// and emits funnel events (land / view / add-to-cart). Best-effort & non-blocking.
import { api, STORE_ID } from './api';

const AID_KEY = 'acp.aid';
const ATTR_KEY = 'acp.attr';

function anonId() {
  let id = localStorage.getItem(AID_KEY);
  if (!id) {
    id = `a_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(AID_KEY, id);
  }
  return id;
}

function attribution() {
  try {
    return JSON.parse(localStorage.getItem(ATTR_KEY) || 'null');
  } catch {
    return null;
  }
}

let landed = false;

export function trackLand() {
  if (landed) return;
  landed = true;
  const p = new URLSearchParams(window.location.search);
  if (p.get('utm_source')) {
    const attr = {
      source: p.get('utm_source'),
      medium: p.get('utm_medium') || undefined,
      campaign: p.get('utm_campaign') || undefined,
      term: p.get('utm_term') || undefined,
    };
    localStorage.setItem(ATTR_KEY, JSON.stringify(attr));
  }
  send('LAND');
}

export function track(type, productId) {
  send(type, { productId });
}

// On-site search → feeds search-intent cohorts + unmet-demand analytics.
// resultCount lets analytics flag queries that returned nothing (demand we miss).
export function trackSearch(query, resultCount) {
  if (!query || !query.trim()) return;
  send('SEARCH', { query: query.trim(), resultCount: typeof resultCount === 'number' ? resultCount : undefined });
}

// Identify the visitor by email (stitches prior anonymous events + first-touch).
export function identify(email, type = 'CLICK') {
  if (!email) return;
  send(type, { email });
}

// The storefront-experiment assignment for this visitor (set once App resolves
// the home experience), persisted so the cart page can tag the order too.
const EXP_KEY = `acp.exp.${STORE_ID}`;
export function setExperiment(a) {
  if (a?.id && a?.variantId) localStorage.setItem(EXP_KEY, JSON.stringify({ id: a.id, variantId: a.variantId }));
}
export function getExperiment() {
  try { return JSON.parse(localStorage.getItem(EXP_KEY) || 'null'); } catch { return null; }
}
export function getAnonId() { return anonId(); }
export function getAttribution() { return attribution() || {}; }

function send(type, { productId, email, query, resultCount } = {}) {
  const a = attribution() || {};
  const exp = getExperiment();
  api
    .track(STORE_ID, {
      type, productId, email, query, resultCount, anonymousId: anonId(),
      source: a.source, medium: a.medium, campaign: a.campaign, term: a.term,
      experimentId: exp?.id, experimentVariantId: exp?.variantId,
    })
    .catch(() => undefined);
}
