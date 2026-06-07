// Maps a request hostname to the landing-page audience. The two production
// domains are first-class entries; anything else falls back to a pattern (so
// previews like ecompartner-staging.* or *.partner.* still resolve correctly),
// defaulting to the merchant site.

export const MERCHANT_DOMAIN = 'ecom.imagine.bo';
export const PARTNER_DOMAIN = 'ecompartner.imagine.bo';

// Exact host → audience. www-prefixed variants included.
const EXACT = {
  [MERCHANT_DOMAIN]: 'merchant',
  [`www.${MERCHANT_DOMAIN}`]: 'merchant',
  [PARTNER_DOMAIN]: 'partner',
  [`www.${PARTNER_DOMAIN}`]: 'partner',
};

/**
 * Resolve the audience ('merchant' | 'partner') for a hostname.
 * - Exact match on the two production domains (and their www variants).
 * - Otherwise: any host containing "ecompartner" or "partner" → partner.
 * - Default → merchant.
 */
export function resolveAudience(hostname = '') {
  const host = String(hostname).trim().toLowerCase().replace(/:\d+$/, '');
  if (EXACT[host]) return EXACT[host];
  if (/(^|\.)ecompartner\./.test(host) || /partner/.test(host)) return 'partner';
  return 'merchant';
}
