import type { PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';
import type { ProductService } from './product.service.js';
import type { CartService } from './cart.service.js';
import type { LoyaltyService } from './loyalty.service.js';
import type { SubscriptionService } from './subscription.service.js';
import type { StockService } from './stock.service.js';
import type { CheckoutSettingsService } from './checkout-settings.service.js';
import type { InvoiceService } from './invoice.service.js';
import { renderInvoiceHtml } from './invoice.service.js';
import type { LegalService } from './legal.service.js';

/**
 * Public, store-scoped surface for a customer-facing storefront. No API key:
 * the store is identified by its (opaque) id, and the owning tenant is derived
 * from it. Only buyer-safe operations are exposed (active catalog, carts,
 * checkout), each delegating to the same tenant-scoped commerce services.
 */
export class StorefrontService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly products: ProductService,
    private readonly carts: CartService,
    private readonly loyalty: LoyaltyService,
    private readonly subscriptions: SubscriptionService,
    private readonly stock?: StockService,
    private readonly checkoutSettings?: CheckoutSettingsService,
    private readonly invoices?: InvoiceService,
    private readonly legal?: LegalService,
  ) {}

  // --- Legal policies (storefront footer + policy pages) --------------------

  /** Published legal policies for the storefront footer. */
  async legalPolicies(storeId: string) {
    await this.ctxForStore(storeId);
    return (await this.legal?.publicList(storeId)) ?? [];
  }

  /** A single published legal policy (by type/slug) for the storefront. */
  async legalPolicy(storeId: string, type: string) {
    await this.ctxForStore(storeId);
    return (await this.legal?.publicGet(storeId, type)) ?? null;
  }

  /** Adds a buyer-safe `availability` (in_stock / low_stock / out_of_stock) to
   * each variant of the given products, without exposing exact counts to UIs. */
  private async withAvailability(storeId: string, products: any[]): Promise<any[]> {
    const track = (await this.stock?.fulfillmentPolicy(storeId))?.trackInventory ?? true;
    const label = (v: any) =>
      this.stock?.availabilityOf({ inventory: v.inventory ?? 0, reserved: v.reserved ?? 0 }, track) ??
      ((v.inventory ?? 0) - (v.reserved ?? 0) > 0 ? 'in_stock' : 'out_of_stock');
    return products.map((p) => ({
      ...p,
      availability: (p.variants ?? []).some((v: any) => label(v) !== 'out_of_stock') ? 'in_stock' : 'out_of_stock',
      variants: (p.variants ?? []).map((v: any) => ({ ...v, availability: label(v) })),
    }));
  }

  private async ctxForStore(storeId: string): Promise<{ ctx: TenantContext; store: any }> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: { tenant: { select: { status: true } } },
    });
    if (!store || store.status !== 'ACTIVE' || store.tenant.status === 'SUSPENDED') {
      throw new NotFoundError('Store', storeId);
    }
    return { ctx: { tenantId: store.tenantId }, store };
  }

  private async ctxForCart(cartId: string): Promise<{ ctx: TenantContext; storeId: string }> {
    const cart = await this.prisma.cart.findUnique({ where: { id: cartId }, select: { tenantId: true, storeId: true } });
    if (!cart) throw new NotFoundError('Cart', cartId);
    return { ctx: { tenantId: cart.tenantId }, storeId: cart.storeId };
  }

  async getStore(storeId: string) {
    const { store } = await this.ctxForStore(storeId);
    return { id: store.id, name: store.name, slug: store.slug, currency: store.currency, country: store.country };
  }

  /** Active products only, with variants — what a buyer may browse. */
  async listProducts(storeId: string) {
    const { ctx } = await this.ctxForStore(storeId);
    const all = await this.products.list(ctx, storeId);
    return this.withAvailability(storeId, all.filter((p) => p.status === 'ACTIVE'));
  }

  async getProduct(storeId: string, productId: string) {
    const { ctx } = await this.ctxForStore(storeId);
    const product = await this.products.get(ctx, productId);
    if (product.storeId !== storeId || product.status !== 'ACTIVE') {
      throw new NotFoundError('Product', productId);
    }
    return (await this.withAvailability(storeId, [product]))[0];
  }

  /** Full-text-ish product search (title/description) over active products. */
  async searchProducts(storeId: string, query: string) {
    await this.ctxForStore(storeId);
    const q = (query ?? '').trim();
    if (!q) return [];
    const products = await this.prisma.product.findMany({
      where: {
        storeId,
        status: 'ACTIVE',
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: { variants: { orderBy: { priceMinor: 'asc' }, take: 1 } },
      take: 50,
    });
    const track = (await this.stock?.fulfillmentPolicy(storeId))?.trackInventory ?? true;
    return products.map((p) => {
      const v = p.variants[0];
      return {
        id: p.id,
        title: p.title,
        description: p.description,
        priceMinor: v?.priceMinor ?? null,
        currency: v?.currency ?? 'INR',
        availability: v ? this.stock?.availabilityOf({ inventory: v.inventory, reserved: v.reserved }, track) ?? 'in_stock' : 'out_of_stock',
      };
    });
  }

  /** Order status + shipment tracking for a buyer (by order number + email). */
  async trackOrder(storeId: string, orderNumber: number, email: string) {
    await this.ctxForStore(storeId);
    if (!orderNumber || !email) return null;
    const order = await this.prisma.order.findFirst({
      where: { storeId, number: Number(orderNumber), customer: { email: { equals: email, mode: 'insensitive' } } },
      include: { items: true, shipment: true, invoice: { select: { invoiceNo: true, isTaxInvoice: true } } },
    });
    if (!order) return null;
    return {
      number: order.number,
      status: order.status,
      placedAt: order.createdAt,
      currency: order.currency,
      totalMinor: order.totalMinor,
      items: order.items.map((i) => ({ title: i.title, quantity: i.quantity, unitPriceMinor: i.unitPriceMinor })),
      shipment: order.shipment
        ? { status: order.shipment.status, courier: order.shipment.courier, awb: order.shipment.awb, trackingUrl: order.shipment.trackingUrl }
        : null,
      // Buyers can download their tax invoice once the order is paid + invoiced.
      invoice: order.invoice ? { invoiceNo: order.invoice.invoiceNo, isTaxInvoice: order.invoice.isTaxInvoice } : null,
    };
  }

  /** Buyer-facing tax invoice (verified by order number + email). */
  async invoice(storeId: string, orderNumber: number, email: string) {
    await this.ctxForStore(storeId);
    const inv = await this.invoices?.getForBuyer(storeId, Number(orderNumber), email);
    return inv ?? null;
  }

  /** Buyer-facing printable invoice HTML (verified by order number + email). */
  async invoiceHtml(storeId: string, orderNumber: number, email: string): Promise<string | null> {
    const inv = await this.invoice(storeId, orderNumber, email);
    return inv ? renderInvoiceHtml(inv) : null;
  }

  // --- Wishlist (guest-friendly, keyed by email) ----------------------------

  async wishlist(storeId: string, email: string) {
    await this.ctxForStore(storeId);
    if (!email) return [];
    const items = await this.prisma.wishlistItem.findMany({ where: { storeId, email: email.toLowerCase() }, orderBy: { createdAt: 'desc' } });
    const products = await this.prisma.product.findMany({
      where: { id: { in: items.map((i) => i.productId) }, status: 'ACTIVE' },
      include: { variants: { orderBy: { priceMinor: 'asc' }, take: 1 } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    return items
      .map((i) => {
        const p = byId.get(i.productId);
        if (!p) return null;
        return { productId: p.id, title: p.title, priceMinor: p.variants[0]?.priceMinor ?? null, currency: p.variants[0]?.currency ?? 'INR' };
      })
      .filter(Boolean);
  }

  async addToWishlist(storeId: string, email: string, productId: string) {
    const { store } = await this.ctxForStore(storeId);
    if (!email || !productId) throw new ValidationError('email and productId are required.');
    const product = await this.prisma.product.findFirst({ where: { id: productId, storeId, status: 'ACTIVE' }, select: { id: true } });
    if (!product) throw new NotFoundError('Product', productId);
    await this.prisma.wishlistItem.upsert({
      where: { storeId_email_productId: { storeId, email: email.toLowerCase(), productId } },
      create: { tenantId: store.tenantId, storeId, email: email.toLowerCase(), productId },
      update: {},
    });
    return { saved: true };
  }

  async removeFromWishlist(storeId: string, email: string, productId: string) {
    await this.ctxForStore(storeId);
    if (!email || !productId) throw new ValidationError('email and productId are required.');
    await this.prisma.wishlistItem.deleteMany({ where: { storeId, email: email.toLowerCase(), productId } });
    return { removed: true };
  }

  async createCart(
    storeId: string,
    input: { contactEmail?: string; contactPhone?: string; items?: { variantId: string; quantity: number }[] },
  ) {
    const { ctx } = await this.ctxForStore(storeId);
    return this.carts.createCart(ctx, { storeId, ...input });
  }

  async getCart(cartId: string) {
    const { ctx } = await this.ctxForCart(cartId);
    return this.carts.getCart(ctx, cartId);
  }

  async addItem(cartId: string, input: { variantId: string; quantity: number }) {
    const { ctx } = await this.ctxForCart(cartId);
    return this.carts.addItem(ctx, cartId, input);
  }

  async removeItem(cartId: string, itemId: string) {
    const { ctx } = await this.ctxForCart(cartId);
    return this.carts.removeItem(ctx, cartId, itemId);
  }

  /**
   * Begin checkout: creates a pending order + payment via the active provider.
   * Captures the delivery address, identifies the shopper by email, redeems
   * loyalty points, and applies the store's tax + shipping.
   */
  async checkout(
    cartId: string,
    opts: { email?: string; redeemPoints?: number; shippingAddress?: Record<string, unknown>; marketingOptIn?: boolean; acceptanceIp?: string } = {},
  ) {
    const { ctx, storeId } = await this.ctxForCart(cartId);
    const settings = await this.checkoutSettings?.resolve(storeId);
    if (settings?.requireAddress) {
      const a = opts.shippingAddress ?? {};
      if (!(a as any).line1 && !(a as any).pincode) {
        throw new ValidationError('A delivery address (at least a street line or pincode) is required to check out.');
      }
    }
    return this.carts.checkoutCart(ctx, cartId, opts);
  }

  /** Public price breakdown for a cart (subtotal, discount, tax, shipping, total). */
  async checkoutQuote(cartId: string) {
    const { ctx, storeId } = await this.ctxForCart(cartId);
    const cart = await this.carts.getCart(ctx, cartId);
    const items = (cart.items ?? []).map((i: any) => ({ variantId: i.variantId, quantity: i.quantity }));
    const subtotalMinor = (cart.items ?? []).reduce((s: number, i: any) => s + i.unitPriceMinor * i.quantity, 0);
    // Offers/loyalty are applied at checkout; the quote shows a pre-discount estimate.
    return (await this.checkoutSettings?.quote(storeId, subtotalMinor, 0)) ?? { subtotalMinor, discountMinor: 0, taxMinor: 0, taxLabel: 'Tax', shippingMinor: 0, totalMinor: subtotalMinor, pricesIncludeTax: false };
  }

  /** Public loyalty balance/program lookup by email (for the rewards widget). */
  async loyaltyBalance(storeId: string, email: string) {
    await this.ctxForStore(storeId);
    return this.loyalty.publicBalance(storeId, email);
  }

  /**
   * Look up an order by its number + customer email for the returns flow. Only
   * buyer-safe fields (items, status) are exposed so a shopper can pick what to
   * return. Returns null when no order matches.
   */
  async lookupOrder(storeId: string, orderNumber: number, email: string) {
    await this.ctxForStore(storeId);
    if (!orderNumber || !email) return null;
    const order = await this.prisma.order.findFirst({
      where: {
        storeId,
        number: Number(orderNumber),
        customer: { email: { equals: email, mode: 'insensitive' } },
      },
      include: { items: true },
    });
    if (!order) return null;
    return {
      number: order.number,
      status: order.status,
      currency: order.currency,
      items: order.items.map((i) => ({ orderItemId: i.id, title: i.title, quantity: i.quantity, unitPriceMinor: i.unitPriceMinor })),
    };
  }

  // --- Subscriptions (public) -----------------------------------------------

  async subscriptionSettings(storeId: string) {
    await this.ctxForStore(storeId);
    return this.subscriptions.publicSettings(storeId);
  }

  async subscribe(storeId: string, input: { variantId: string; quantity?: number; interval: any; email: string }) {
    const { ctx } = await this.ctxForStore(storeId);
    return this.subscriptions.create(ctx, { storeId, ...input });
  }

  async mySubscriptions(storeId: string, email: string) {
    await this.ctxForStore(storeId);
    return this.subscriptions.listForEmail(storeId, email);
  }

  async manageSubscription(storeId: string, email: string, subscriptionId: string, status: any) {
    await this.ctxForStore(storeId);
    return this.subscriptions.manageByEmail(storeId, email, subscriptionId, status);
  }
}
