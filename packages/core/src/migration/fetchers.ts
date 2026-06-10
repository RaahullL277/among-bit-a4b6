// Live ingestion from a merchant's existing Shopify (Admin API) or WooCommerce
// (REST API) store. Fetches over HTTP and normalizes into the same import shapes
// the CSV parsers produce. `fetchImpl` is injectable so the import flow can be
// tested without network access.

import {
  type ImportCustomer,
  type ImportKind,
  type ImportOrder,
  type ImportProduct,
  mapOrderStatus,
} from './parsers.js';

export type FetchImpl = typeof fetch;

export interface ApiCredentials {
  // Shopify
  shop?: string; // "mystore" or "mystore.myshopify.com"
  accessToken?: string;
  // WooCommerce
  url?: string; // "https://store.example"
  consumerKey?: string;
  consumerSecret?: string;
  apiVersion?: string;
}

export interface ApiFetchResult {
  products?: ImportProduct[];
  customers?: ImportCustomer[];
  orders?: ImportOrder[];
}

const MAX_PAGES = 20; // safety cap (≈ a few thousand records per run)

function toMinor(value: unknown): number {
  if (value == null || value === '') return 0;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

// --- SSRF guard -------------------------------------------------------------

// Reject hosts that point at the local machine, link-local/metadata, or private
// networks so a merchant-supplied import URL can't be used to probe internal
// services. (Residual DNS-rebinding risk is out of scope for this guard.)
function assertPublicHttpsHost(host: string): void {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) {
    throw new Error('Import URL host is not allowed.');
  }
  // Literal IPv4/IPv6 in private / loopback / link-local ranges.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const [a, b] = h.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) {
      throw new Error('Import URL host is not allowed.');
    }
  }
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80') || h.startsWith('[')) {
    throw new Error('Import URL host is not allowed.');
  }
}

/** Validate a merchant-supplied import URL: https only, public host. */
function safeBaseUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('Import URL is not a valid URL.');
  }
  if (u.protocol !== 'https:') throw new Error('Import URL must use https.');
  assertPublicHttpsHost(u.hostname);
  return u;
}

// --- Shopify Admin API ------------------------------------------------------

function shopifyBase(creds: ApiCredentials): string {
  if (!creds.shop || !creds.accessToken) throw new Error('Shopify import needs { shop, accessToken }.');
  const host = creds.shop.includes('.') ? creds.shop : `${creds.shop}.myshopify.com`;
  // Custom Shopify hosts must be a real myshopify.com store, not an arbitrary host.
  if (creds.shop.includes('.') && !/^[a-z0-9-]+\.myshopify\.com$/i.test(host)) {
    throw new Error('Shopify shop must be a *.myshopify.com host.');
  }
  return `https://${host}/admin/api/${creds.apiVersion ?? '2024-01'}`;
}

async function shopifyGet(fetchImpl: FetchImpl, creds: ApiCredentials, path: string): Promise<any> {
  const res = await fetchImpl(`${shopifyBase(creds)}/${path}`, {
    headers: { 'X-Shopify-Access-Token': creds.accessToken!, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Shopify API ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  return res.json();
}

function shopifyProduct(p: any): ImportProduct {
  const variants = Array.isArray(p.variants) && p.variants.length
    ? p.variants.map((v: any) => ({
        title: v.title && v.title !== 'Default Title' ? v.title : undefined,
        sku: v.sku || undefined,
        priceMinor: toMinor(v.price),
        compareAtMinor: v.compare_at_price ? toMinor(v.compare_at_price) : undefined,
        inventory: typeof v.inventory_quantity === 'number' ? v.inventory_quantity : undefined,
      }))
    : [{ priceMinor: 0 }];
  return {
    title: String(p.title ?? 'Untitled'),
    description: p.body_html || undefined,
    status: String(p.status ?? 'active').toLowerCase() === 'active' ? 'ACTIVE' : 'DRAFT',
    variants,
  };
}

async function shopifyFetch(fetchImpl: FetchImpl, creds: ApiCredentials, kind: ImportKind): Promise<ApiFetchResult> {
  if (kind === 'customers') {
    const out: ImportCustomer[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const data = await shopifyGet(fetchImpl, creds, `customers.json?limit=250&page=${page}`);
      const list = data.customers ?? [];
      if (!list.length) break;
      for (const c of list) {
        out.push({ name: [c.first_name, c.last_name].filter(Boolean).join(' ') || undefined, email: c.email || undefined, phone: c.phone || undefined });
      }
      if (list.length < 250) break;
    }
    return { customers: out };
  }
  if (kind === 'orders') {
    const out: ImportOrder[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const data = await shopifyGet(fetchImpl, creds, `orders.json?status=any&limit=250&page=${page}`);
      const list = data.orders ?? [];
      if (!list.length) break;
      for (const o of list) {
        out.push({
          sourceRef: String(o.name ?? o.id),
          email: o.email || undefined,
          status: mapOrderStatus('SHOPIFY', o.financial_status ?? o.fulfillment_status ?? ''),
          createdAt: o.created_at || undefined,
          currency: o.currency || undefined,
          totalMinor: toMinor(o.total_price),
          items: (o.line_items ?? []).map((li: any) => ({ title: li.title ?? li.name ?? 'Item', sku: li.sku || undefined, quantity: Number(li.quantity) || 1, unitPriceMinor: toMinor(li.price) })),
        });
      }
      if (list.length < 250) break;
    }
    return { orders: out };
  }
  const out: ImportProduct[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await shopifyGet(fetchImpl, creds, `products.json?limit=250&page=${page}`);
    const list = data.products ?? [];
    if (!list.length) break;
    for (const p of list) out.push(shopifyProduct(p));
    if (list.length < 250) break;
  }
  return { products: out };
}

// --- WooCommerce REST API ---------------------------------------------------

function wooBase(creds: ApiCredentials): string {
  if (!creds.url || !creds.consumerKey || !creds.consumerSecret) throw new Error('WooCommerce import needs { url, consumerKey, consumerSecret }.');
  const u = safeBaseUrl(creds.url); // SSRF guard: https + public host only
  return `${u.origin}${u.pathname.replace(/\/$/, '')}/wp-json/wc/v3`;
}

async function wooGet(fetchImpl: FetchImpl, creds: ApiCredentials, path: string): Promise<any> {
  const auth = Buffer.from(`${creds.consumerKey}:${creds.consumerSecret}`).toString('base64');
  const res = await fetchImpl(`${wooBase(creds)}/${path}`, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) throw new Error(`WooCommerce API ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  return res.json();
}

async function wooFetch(fetchImpl: FetchImpl, creds: ApiCredentials, kind: ImportKind): Promise<ApiFetchResult> {
  if (kind === 'customers') {
    const out: ImportCustomer[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const list = await wooGet(fetchImpl, creds, `customers?per_page=100&page=${page}`);
      if (!Array.isArray(list) || !list.length) break;
      for (const c of list) out.push({ name: [c.first_name, c.last_name].filter(Boolean).join(' ') || undefined, email: c.email || undefined, phone: c.billing?.phone || undefined });
      if (list.length < 100) break;
    }
    return { customers: out };
  }
  if (kind === 'orders') {
    const out: ImportOrder[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const list = await wooGet(fetchImpl, creds, `orders?per_page=100&page=${page}`);
      if (!Array.isArray(list) || !list.length) break;
      for (const o of list) {
        out.push({
          sourceRef: String(o.number ?? o.id),
          email: o.billing?.email || undefined,
          status: mapOrderStatus('WOOCOMMERCE', o.status ?? ''),
          createdAt: o.date_created || undefined,
          currency: o.currency || undefined,
          totalMinor: toMinor(o.total),
          items: (o.line_items ?? []).map((li: any) => ({ title: li.name ?? 'Item', sku: li.sku || undefined, quantity: Number(li.quantity) || 1, unitPriceMinor: toMinor(li.price) })),
        });
      }
      if (list.length < 100) break;
    }
    return { orders: out };
  }
  const out: ImportProduct[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const list = await wooGet(fetchImpl, creds, `products?per_page=100&page=${page}`);
    if (!Array.isArray(list) || !list.length) break;
    for (const p of list) {
      out.push({
        title: String(p.name ?? 'Untitled'),
        description: p.description || p.short_description || undefined,
        status: String(p.status ?? 'publish') === 'publish' ? 'ACTIVE' : 'DRAFT',
        variants: [
          {
            sku: p.sku || undefined,
            priceMinor: toMinor(p.price || p.regular_price),
            compareAtMinor: p.regular_price && p.sale_price ? toMinor(p.regular_price) : undefined,
            inventory: typeof p.stock_quantity === 'number' ? p.stock_quantity : undefined,
          },
        ],
      });
    }
    if (list.length < 100) break;
  }
  return { products: out };
}

/** Fetch + normalize from a live store API. Throws for unsupported sources. */
export async function fetchFromApi(
  source: 'SHOPIFY' | 'WOOCOMMERCE',
  creds: ApiCredentials,
  kind: ImportKind,
  fetchImpl: FetchImpl = fetch,
): Promise<ApiFetchResult> {
  if (kind === 'inventory') throw new Error('Inventory import is file-based; use the CSV/JSON path.');
  if (source === 'SHOPIFY') return shopifyFetch(fetchImpl, creds, kind);
  if (source === 'WOOCOMMERCE') return wooFetch(fetchImpl, creds, kind);
  throw new Error(`Live API import is not supported for source "${source}".`);
}
