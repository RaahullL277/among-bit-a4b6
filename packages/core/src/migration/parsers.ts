// Parsers that turn a product/customer export from Shopify, WooCommerce, Dukaan,
// or a generic CSV/JSON into the platform's normalized import shape. Pure, no I/O
// or DB — the import service feeds the result into the existing services.

export interface ImportVariant {
  title?: string;
  sku?: string;
  priceMinor: number;
  compareAtMinor?: number;
  inventory?: number;
}

export interface ImportProduct {
  title: string;
  description?: string;
  status: 'ACTIVE' | 'DRAFT';
  variants: ImportVariant[];
}

export interface ImportCustomer {
  name?: string;
  email?: string;
  phone?: string;
}

export interface ImportOrderItem {
  title: string;
  sku?: string;
  quantity: number;
  unitPriceMinor: number;
}

export interface ImportOrder {
  /** External id/number used to de-duplicate (e.g. Shopify order name). */
  sourceRef: string;
  email?: string;
  status: 'PENDING' | 'PAID' | 'FULFILLED' | 'CANCELLED' | 'REFUNDED';
  createdAt?: string;
  currency?: string;
  totalMinor: number;
  items: ImportOrderItem[];
}

export interface ImportInventoryRow {
  sku: string;
  quantity: number;
}

export type ImportSourceName = 'SHOPIFY' | 'WOOCOMMERCE' | 'DUKAAN' | 'GENERIC';
export type ImportKind = 'products' | 'customers' | 'orders' | 'inventory';

// --- CSV parsing (RFC-4180-ish: quotes, embedded commas/newlines) -----------

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += ch;
    }
  }
  // Flush the trailing field/row (unless the file ended on a newline).
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Parse a CSV into objects keyed by a normalized (lowercased) header. */
export function csvToObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => { o[h] = (r[i] ?? '').trim(); });
    return o;
  });
}

// --- Helpers ----------------------------------------------------------------

/** "₹1,299.50" / "1299.5" → 129950 paise. Returns 0 when unparseable. */
export function toMinor(value: string | number | undefined | null): number {
  if (value == null || value === '') return 0;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function toInt(value: string | undefined): number | undefined {
  if (value == null || value === '') return undefined;
  const n = parseInt(String(value).replace(/[^0-9\-]/g, ''), 10);
  return Number.isFinite(n) ? n : undefined;
}

const truthy = (v?: string) => ['true', 'yes', '1', 'active', 'published', 'publish'].includes(String(v ?? '').trim().toLowerCase());
const pick = (o: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) if (o[k] != null && o[k] !== '') return o[k];
  return '';
};

// --- Product parsers --------------------------------------------------------

/** Shopify product CSV export (rows grouped by Handle; extra rows = variants/images). */
function parseShopifyProducts(text: string): ImportProduct[] {
  const rows = csvToObjects(text);
  const byHandle = new Map<string, ImportProduct>();
  const order: string[] = [];
  for (const r of rows) {
    const handle = pick(r, 'handle');
    const title = pick(r, 'title');
    const price = pick(r, 'variant price', 'price');
    if (handle && !byHandle.has(handle)) {
      if (!title) continue; // an image/variant row before the product row
      byHandle.set(handle, {
        title,
        description: pick(r, 'body (html)', 'body') || undefined,
        status: r['published'] !== undefined ? (truthy(r['published']) ? 'ACTIVE' : 'DRAFT') : 'ACTIVE',
        variants: [],
      });
      order.push(handle);
    }
    const prod = byHandle.get(handle) || (title ? undefined : undefined);
    if (prod && price) {
      prod.variants.push({
        title: pick(r, 'option1 value') || undefined,
        sku: pick(r, 'variant sku', 'sku') || undefined,
        priceMinor: toMinor(price),
        compareAtMinor: toMinor(pick(r, 'variant compare at price')) || undefined,
        inventory: toInt(pick(r, 'variant inventory qty', 'inventory')),
      });
    }
  }
  return order.map((h) => byHandle.get(h)!).map(ensureVariant);
}

/** WooCommerce product CSV export. Variations attach to the preceding parent. */
function parseWooProducts(text: string): ImportProduct[] {
  const rows = csvToObjects(text);
  const products: ImportProduct[] = [];
  let last: ImportProduct | undefined;
  for (const r of rows) {
    const type = pick(r, 'type').toLowerCase();
    const name = pick(r, 'name', 'title');
    const price = pick(r, 'regular price', 'price', 'sale price');
    const variant: ImportVariant = {
      sku: pick(r, 'sku') || undefined,
      priceMinor: toMinor(pick(r, 'sale price') || price),
      compareAtMinor: toMinor(pick(r, 'regular price')) || undefined,
      inventory: toInt(pick(r, 'stock', 'stock quantity')),
    };
    if (type === 'variation' && !name && last) {
      last.variants.push(variant);
      continue;
    }
    if (!name) continue;
    last = {
      title: name,
      description: pick(r, 'description', 'short description') || undefined,
      status: r['published'] !== undefined ? (truthy(r['published']) ? 'ACTIVE' : 'DRAFT') : 'ACTIVE',
      variants: type === 'variable' ? [] : [variant],
    };
    products.push(last);
  }
  return products.map(ensureVariant);
}

/** Dukaan product CSV export (one row per product). */
function parseDukaanProducts(text: string): ImportProduct[] {
  const rows = csvToObjects(text);
  return rows
    .map((r) => {
      const title = pick(r, 'name', 'product name', 'title');
      if (!title) return null;
      const price = pick(r, 'discounted price', 'selling price', 'price');
      return {
        title,
        description: pick(r, 'description') || undefined,
        status: r['status'] !== undefined ? (truthy(r['status']) ? 'ACTIVE' : 'DRAFT') : 'ACTIVE',
        variants: [
          {
            sku: pick(r, 'sku') || undefined,
            priceMinor: toMinor(price),
            compareAtMinor: toMinor(pick(r, 'price', 'mrp', 'market price')) || undefined,
            inventory: toInt(pick(r, 'quantity', 'stock', 'inventory')),
          },
        ],
      } as ImportProduct;
    })
    .filter((p): p is ImportProduct => Boolean(p))
    .map(ensureVariant);
}

/** Generic CSV (title,price,sku,inventory,description,status) or our own shape. */
function parseGenericProducts(text: string): ImportProduct[] {
  const rows = csvToObjects(text);
  return rows
    .map((r) => {
      const title = pick(r, 'title', 'name');
      if (!title) return null;
      return {
        title,
        description: pick(r, 'description') || undefined,
        status: r['status'] !== undefined ? (truthy(r['status']) ? 'ACTIVE' : 'DRAFT') : 'ACTIVE',
        variants: [
          {
            sku: pick(r, 'sku') || undefined,
            priceMinor: toMinor(pick(r, 'price', 'priceminor') ? pick(r, 'price') : ''),
            inventory: toInt(pick(r, 'inventory', 'stock', 'quantity')),
          },
        ],
      } as ImportProduct;
    })
    .filter((p): p is ImportProduct => Boolean(p))
    .map(ensureVariant);
}

function ensureVariant(p: ImportProduct): ImportProduct {
  if (p.variants.length === 0) p.variants.push({ priceMinor: 0 });
  return p;
}

// --- Customer parsers -------------------------------------------------------

function parseCustomers(text: string): ImportCustomer[] {
  const rows = csvToObjects(text);
  return rows
    .map((r) => {
      const name = pick(r, 'name', 'customer name') || [pick(r, 'first name'), pick(r, 'last name')].filter(Boolean).join(' ').trim();
      const email = pick(r, 'email', 'email address');
      const phone = pick(r, 'phone', 'mobile', 'phone number', 'default address phone');
      return { name: name || undefined, email: email || undefined, phone: phone || undefined };
    })
    .filter((c) => c.email || c.phone || c.name);
}

// --- JSON (platform's own shape) -------------------------------------------

function parseJsonProducts(data: string): ImportProduct[] {
  const arr = JSON.parse(data);
  const list = Array.isArray(arr) ? arr : Array.isArray(arr.products) ? arr.products : [];
  return list
    .map((p: any) => {
      if (!p?.title) return null;
      const variants: ImportVariant[] = Array.isArray(p.variants) && p.variants.length
        ? p.variants.map((v: any) => ({
            title: v.title,
            sku: v.sku,
            priceMinor: v.priceMinor != null ? Number(v.priceMinor) : toMinor(v.price),
            compareAtMinor: v.compareAtMinor,
            inventory: v.inventory,
          }))
        : [{ priceMinor: p.priceMinor != null ? Number(p.priceMinor) : toMinor(p.price), inventory: p.inventory }];
      return { title: String(p.title), description: p.description, status: p.status === 'DRAFT' ? 'DRAFT' : 'ACTIVE', variants } as ImportProduct;
    })
    .filter((p: ImportProduct | null): p is ImportProduct => Boolean(p))
    .map(ensureVariant);
}

// --- Dispatch ---------------------------------------------------------------

export function parseProducts(source: ImportSourceName, text: string): ImportProduct[] {
  const trimmed = text.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) return parseJsonProducts(trimmed);
  switch (source) {
    case 'SHOPIFY': return parseShopifyProducts(text);
    case 'WOOCOMMERCE': return parseWooProducts(text);
    case 'DUKAAN': return parseDukaanProducts(text);
    default: return parseGenericProducts(text);
  }
}

export function parseImportCustomers(_source: ImportSourceName, text: string): ImportCustomer[] {
  const trimmed = text.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const arr = JSON.parse(trimmed);
    const list = Array.isArray(arr) ? arr : Array.isArray(arr.customers) ? arr.customers : [];
    return list.map((c: any) => ({ name: c.name, email: c.email, phone: c.phone })).filter((c: ImportCustomer) => c.email || c.phone || c.name);
  }
  return parseCustomers(text);
}

// --- Order status mapping ---------------------------------------------------

/** Map an external order status string to our OrderStatus. */
export function mapOrderStatus(source: ImportSourceName, raw: string): ImportOrder['status'] {
  const s = String(raw ?? '').trim().toLowerCase();
  if (['refunded', 'partially_refunded'].includes(s)) return 'REFUNDED';
  if (['cancelled', 'canceled', 'voided'].includes(s)) return 'CANCELLED';
  if (['fulfilled', 'completed', 'delivered', 'shipped'].includes(s)) return 'FULFILLED';
  if (['paid', 'processing', 'on-hold'].includes(s)) return 'PAID';
  return 'PENDING';
}

// --- Order parsers (text) ---------------------------------------------------

/** Shopify orders CSV export (one row per line item, grouped by "Name"). */
function parseShopifyOrders(text: string): ImportOrder[] {
  const rows = csvToObjects(text);
  const byName = new Map<string, ImportOrder>();
  const order: string[] = [];
  for (const r of rows) {
    const name = pick(r, 'name', 'order', 'order name');
    if (!name) continue;
    if (!byName.has(name)) {
      byName.set(name, {
        sourceRef: name,
        email: pick(r, 'email') || undefined,
        status: mapOrderStatus('SHOPIFY', pick(r, 'financial status', 'fulfillment status', 'status')),
        createdAt: pick(r, 'created at', 'paid at') || undefined,
        currency: pick(r, 'currency') || undefined,
        totalMinor: toMinor(pick(r, 'total')),
        items: [],
      });
      order.push(name);
    }
    const o = byName.get(name)!;
    const liName = pick(r, 'lineitem name', 'lineitem');
    if (liName) {
      o.items.push({
        title: liName,
        sku: pick(r, 'lineitem sku') || undefined,
        quantity: Number(pick(r, 'lineitem quantity')) || 1,
        unitPriceMinor: toMinor(pick(r, 'lineitem price')),
      });
    }
  }
  return order.map((n) => byName.get(n)!).map(deriveOrderTotal);
}

/** Generic JSON orders (the platform's own shape). */
function parseJsonOrders(data: string): ImportOrder[] {
  const arr = JSON.parse(data);
  const list = Array.isArray(arr) ? arr : Array.isArray(arr.orders) ? arr.orders : [];
  return list
    .map((o: any, idx: number) => {
      const items: ImportOrderItem[] = Array.isArray(o.items)
        ? o.items.map((i: any) => ({
            title: String(i.title ?? 'Item'),
            sku: i.sku,
            quantity: Number(i.quantity) || 1,
            unitPriceMinor: i.unitPriceMinor != null ? Number(i.unitPriceMinor) : toMinor(i.price),
          }))
        : [];
      return {
        sourceRef: String(o.sourceRef ?? o.id ?? o.number ?? `json-${idx}`),
        email: o.email,
        status: o.status ? mapOrderStatus('GENERIC', o.status) : 'PAID',
        createdAt: o.createdAt,
        currency: o.currency,
        totalMinor: o.totalMinor != null ? Number(o.totalMinor) : toMinor(o.total),
        items,
      } as ImportOrder;
    })
    .map(deriveOrderTotal);
}

/** Fall back to the line-item sum when no explicit total is present. */
function deriveOrderTotal(o: ImportOrder): ImportOrder {
  if (!o.totalMinor || o.totalMinor <= 0) {
    o.totalMinor = o.items.reduce((s, i) => s + i.unitPriceMinor * i.quantity, 0);
  }
  return o;
}

export function parseOrders(source: ImportSourceName, text: string): ImportOrder[] {
  const trimmed = text.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) return parseJsonOrders(trimmed);
  switch (source) {
    case 'SHOPIFY': return parseShopifyOrders(text);
    // WooCommerce / Dukaan order CSVs vary widely; the generic Shopify-style
    // grouping covers the common "Name,Email,...,Lineitem" export shape.
    default: return parseShopifyOrders(text);
  }
}

// --- Inventory parser (text) ------------------------------------------------

/** A SKU->quantity stock sheet (CSV with sku + quantity/stock/inventory, or JSON). */
export function parseInventory(text: string): ImportInventoryRow[] {
  const trimmed = text.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const arr = JSON.parse(trimmed);
    const list = Array.isArray(arr) ? arr : Array.isArray(arr.inventory) ? arr.inventory : [];
    return list
      .map((r: any) => ({ sku: String(r.sku ?? '').trim(), quantity: Number(r.quantity ?? r.inventory ?? r.stock) }))
      .filter((r: ImportInventoryRow) => r.sku && Number.isFinite(r.quantity));
  }
  return csvToObjects(text)
    .map((r) => ({
      sku: pick(r, 'sku', 'variant sku').trim(),
      quantity: Number(pick(r, 'quantity', 'stock', 'inventory', 'variant inventory qty', 'stock quantity')),
    }))
    .filter((r) => r.sku && Number.isFinite(r.quantity));
}
