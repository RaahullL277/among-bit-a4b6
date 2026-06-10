import type { CartStatus, PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';
import type { PaymentService } from './payment.service.js';
import type { NotificationService } from './notification.service.js';
import type { OfferService } from './offer.service.js';
import type { LoyaltyService } from './loyalty.service.js';
import type { DiscountService } from './discount.service.js';

const cartInclude = { items: true } as const;

const DEFAULT_POLICY = {
  enabled: true,
  abandonAfterMinutes: 60,
  stepDelaysMinutes: [0, 1440, 4320], // immediately, +24h, +72h after abandonment
};

export interface CreateCartInput {
  storeId: string;
  customerId?: string;
  contactEmail?: string;
  contactPhone?: string;
  items?: { variantId: string; quantity: number }[];
}

/**
 * Shopping carts and abandoned-cart recovery. A cart holds items a shopper
 * added but has not paid for; if it goes idle past the store's threshold it is
 * marked ABANDONED and a recovery sequence is sent via the notification system.
 */
export class CartService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly payments: PaymentService,
    private readonly notifications: NotificationService,
    private readonly offers?: OfferService,
    private readonly loyalty?: LoyaltyService,
    private readonly discounts?: DiscountService,
  ) {}

  /** Find a store customer by email, creating one if needed (for loyalty). */
  private async resolveCustomer(ctx: TenantContext, storeId: string, email: string): Promise<string> {
    const existing = await this.prisma.customer.findFirst({
      where: { storeId, email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await this.prisma.customer.create({ data: { tenantId: ctx.tenantId, storeId, email } });
    return created.id;
  }

  private async assertStore(ctx: TenantContext, storeId: string) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!store) throw new NotFoundError('Store', storeId);
  }

  async createCart(ctx: TenantContext, input: CreateCartInput) {
    await this.assertStore(ctx, input.storeId);
    const cart = await this.prisma.cart.create({
      data: {
        tenantId: ctx.tenantId,
        storeId: input.storeId,
        customerId: input.customerId,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
      },
    });
    if (input.items?.length) {
      // Batch: resolve all variants once and createMany, instead of N round-trips.
      const qtyByVariant = new Map<string, number>();
      for (const it of input.items) {
        if (it.quantity > 0) qtyByVariant.set(it.variantId, Math.min(99, (qtyByVariant.get(it.variantId) ?? 0) + it.quantity));
      }
      const variants = await this.prisma.productVariant.findMany({
        where: { id: { in: [...qtyByVariant.keys()] }, tenantId: ctx.tenantId },
        select: { id: true, title: true, priceMinor: true },
      });
      if (variants.length !== qtyByVariant.size) throw new NotFoundError('ProductVariant', 'one or more cart items');
      await this.prisma.cartItem.createMany({
        data: variants.map((v) => ({ tenantId: ctx.tenantId, cartId: cart.id, variantId: v.id, title: v.title, quantity: qtyByVariant.get(v.id)!, unitPriceMinor: v.priceMinor })),
      });
    }
    return this.getCart(ctx, cart.id);
  }

  async getCart(ctx: TenantContext, id: string) {
    const cart = await this.prisma.cart.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: cartInclude,
    });
    if (!cart) throw new NotFoundError('Cart', id);
    return cart;
  }

  async listCarts(ctx: TenantContext, opts: { storeId?: string; status?: CartStatus } = {}) {
    return this.prisma.cart.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(opts.storeId ? { storeId: opts.storeId } : {}),
        ...(opts.status ? { status: opts.status } : {}),
      },
      include: cartInclude,
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** Add (or increment) a variant in the cart, snapshotting its price. */
  async addItem(ctx: TenantContext, cartId: string, input: { variantId: string; quantity: number }) {
    const cart = await this.getCart(ctx, cartId);
    if (input.quantity <= 0) throw new ValidationError('Quantity must be positive.');

    const variant = await this.prisma.productVariant.findFirst({
      where: { id: input.variantId, tenantId: ctx.tenantId },
    });
    if (!variant) throw new NotFoundError('ProductVariant', input.variantId);

    await this.prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId, variantId: variant.id } },
      create: {
        tenantId: ctx.tenantId,
        cartId,
        variantId: variant.id,
        title: variant.title,
        quantity: input.quantity,
        unitPriceMinor: variant.priceMinor,
      },
      update: { quantity: { increment: input.quantity } },
    });
    // Keep the per-line ceiling consistent with setItemQuantity (max 99).
    await this.prisma.cartItem.updateMany({
      where: { cartId, variantId: variant.id, quantity: { gt: 99 } },
      data: { quantity: 99 },
    });
    await this.touch(cart.id);
    return this.getCart(ctx, cartId);
  }

  async removeItem(ctx: TenantContext, cartId: string, itemId: string) {
    await this.getCart(ctx, cartId);
    await this.prisma.cartItem.deleteMany({ where: { id: itemId, cartId } });
    await this.touch(cartId);
    return this.getCart(ctx, cartId);
  }

  /** Set the absolute quantity of a variant in the cart (0 = remove). */
  async setItemQuantity(ctx: TenantContext, cartId: string, variantId: string, quantity: number) {
    await this.getCart(ctx, cartId);
    const qty = Math.round(quantity);
    if (qty <= 0) {
      await this.prisma.cartItem.deleteMany({ where: { cartId, variantId } });
    } else {
      const item = await this.prisma.cartItem.findUnique({ where: { cartId_variantId: { cartId, variantId } } });
      if (!item) throw new NotFoundError('CartItem', variantId);
      await this.prisma.cartItem.update({ where: { id: item.id }, data: { quantity: Math.min(99, qty) } });
    }
    await this.touch(cartId);
    return this.getCart(ctx, cartId);
  }

  /** Remove a variant line from the cart (storefront convenience by variantId). */
  async removeVariant(ctx: TenantContext, cartId: string, variantId: string) {
    await this.getCart(ctx, cartId);
    await this.prisma.cartItem.deleteMany({ where: { cartId, variantId } });
    await this.touch(cartId);
    return this.getCart(ctx, cartId);
  }

  /** Reset activity and (if it was abandoned) bring the cart back to ACTIVE. */
  private async touch(cartId: string) {
    const cart = await this.prisma.cart.findUnique({ where: { id: cartId }, select: { status: true } });
    await this.prisma.cart.update({
      where: { id: cartId },
      data: {
        lastActivityAt: new Date(),
        ...(cart?.status === 'ABANDONED' ? { status: 'ACTIVE', abandonedAt: null } : {}),
      },
    });
  }

  /** Check out a cart: creates an order/payment and links them back to it. */
  async checkoutCart(
    ctx: TenantContext,
    cartId: string,
    opts: { provider?: any; email?: string; redeemPoints?: number; shippingAddress?: Record<string, unknown>; marketingOptIn?: boolean; acceptanceIp?: string; discountCode?: string; experimentId?: string; experimentVariantId?: string } = {},
  ) {
    const cart = await this.getCart(ctx, cartId);
    if (!cart.items.length) throw new ValidationError('Cannot check out an empty cart.');

    const items = cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
    const subtotalMinor = cart.items.reduce((s, i) => s + i.unitPriceMinor * i.quantity, 0);

    // Identify the customer (for loyalty): explicit email, else the cart's link.
    let customerId = cart.customerId ?? undefined;
    if (!customerId && opts.email) customerId = await this.resolveCustomer(ctx, cart.storeId, opts.email);

    // Auto-apply any bundle saving the cart qualifies for.
    const offer = this.offers ? await this.offers.computeCartDiscount(ctx, cart.storeId, items) : undefined;
    let discountMinor = offer?.discountMinor ?? 0;

    // Apply a coupon/discount code (validated against the subtotal).
    if (opts.discountCode && this.discounts) {
      const v = await this.discounts.validate(cart.storeId, opts.discountCode, subtotalMinor);
      if (!v.valid) throw new ValidationError('That discount code can\'t be applied to this order.');
      // Atomically claim a redemption slot BEFORE committing the order so a
      // capped code can never be over-redeemed under concurrent checkouts.
      const claimed = await this.discounts.redeem(cart.storeId, v.code ?? opts.discountCode);
      if (!claimed) throw new ValidationError('That discount code is no longer available.');
      discountMinor += v.discountMinor;
    }

    // Redeem loyalty points for a discount, capped at the remaining order value.
    if (opts.redeemPoints && customerId && this.loyalty) {
      const remaining = Math.max(0, subtotalMinor - discountMinor);
      const r = await this.loyalty.redeem(ctx, customerId, opts.redeemPoints, remaining);
      discountMinor += r.discountMinor;
    }

    const result = await this.payments.checkout(ctx, {
      storeId: cart.storeId,
      customerId,
      items,
      provider: opts.provider,
      discountMinor: discountMinor || undefined,
      email: opts.email ?? cart.contactEmail ?? undefined,
      shippingAddress: opts.shippingAddress,
      marketingOptIn: opts.marketingOptIn,
      acceptanceIp: opts.acceptanceIp,
    });

    await this.prisma.order.update({
      where: { id: result.order.id },
      data: { cartId, experimentId: opts.experimentId, experimentVariantId: opts.experimentVariantId },
    });
    // The cart is intentionally NOT marked CONVERTED/RECOVERED here: the order is
    // only PENDING. If the shopper abandons the hosted checkout before paying, the
    // cart must stay ACTIVE/ABANDONED so recovery can still reach them. The cart is
    // converted when payment is captured (PaymentService.applyPaymentStatus).
    // Reflect the link on the returned order (the DB update happened after it was built).
    return { ...result, order: { ...result.order, cartId } };
  }

  // --- Recovery policy ------------------------------------------------------

  async getPolicy(ctx: TenantContext, storeId: string) {
    await this.assertStore(ctx, storeId);
    const row = await this.prisma.cartRecoveryPolicy.findUnique({ where: { storeId } });
    return row ?? { storeId, ...DEFAULT_POLICY, isDefault: true };
  }

  async setPolicy(
    ctx: TenantContext,
    input: { storeId: string; enabled?: boolean; abandonAfterMinutes?: number; stepDelaysMinutes?: number[] },
  ) {
    await this.assertStore(ctx, input.storeId);
    const data = {
      enabled: input.enabled ?? DEFAULT_POLICY.enabled,
      abandonAfterMinutes: input.abandonAfterMinutes ?? DEFAULT_POLICY.abandonAfterMinutes,
      stepDelaysMinutes: input.stepDelaysMinutes ?? DEFAULT_POLICY.stepDelaysMinutes,
    };
    return this.prisma.cartRecoveryPolicy.upsert({
      where: { storeId: input.storeId },
      create: { tenantId: ctx.tenantId, storeId: input.storeId, ...data },
      update: data,
    });
  }

  // --- Recovery job (invoked by the worker; not tenant-scoped) --------------

  /**
   * Marks idle carts abandoned and sends any due recovery messages. Runs across
   * all tenants; each store's policy (or the defaults) governs timing.
   */
  async runRecoveryJobs(now: Date = new Date()): Promise<{ abandoned: number; messagesSent: number }> {
    const policies = await this.prisma.cartRecoveryPolicy.findMany();
    const policyByStore = new Map(policies.map((p) => [p.storeId, p]));
    const policyFor = (storeId: string) => policyByStore.get(storeId) ?? DEFAULT_POLICY;

    // 1. Mark idle ACTIVE carts (with items) as abandoned.
    const active = await this.prisma.cart.findMany({
      where: { status: 'ACTIVE', items: { some: {} } },
      select: { id: true, storeId: true, lastActivityAt: true },
    });
    let abandoned = 0;
    for (const cart of active) {
      const policy = policyFor(cart.storeId);
      if (!policy.enabled) continue;
      const idleMs = now.getTime() - cart.lastActivityAt.getTime();
      if (idleMs >= policy.abandonAfterMinutes * 60_000) {
        await this.prisma.cart.update({
          where: { id: cart.id },
          data: { status: 'ABANDONED', abandonedAt: now, recoveryStepsSent: 0 },
        });
        abandoned++;
      }
    }

    // 2. Send any due recovery steps for abandoned carts.
    const abandonedCarts = await this.prisma.cart.findMany({
      where: { status: 'ABANDONED' },
      include: { items: true },
    });
    let messagesSent = 0;
    for (const cart of abandonedCarts) {
      const policy = policyFor(cart.storeId);
      if (!policy.enabled || !cart.abandonedAt) continue;
      const steps = policy.stepDelaysMinutes;
      if (cart.recoveryStepsSent >= steps.length) continue;

      const dueAt = cart.abandonedAt.getTime() + steps[cart.recoveryStepsSent] * 60_000;
      if (now.getTime() < dueAt) continue;

      const sent = await this.sendRecovery(cart);
      await this.prisma.cart.update({
        where: { id: cart.id },
        data: { recoveryStepsSent: { increment: 1 }, lastRecoveryAt: now },
      });
      if (sent) messagesSent++;
    }

    return { abandoned, messagesSent };
  }

  private async sendRecovery(cart: {
    id: string;
    tenantId: string;
    storeId: string;
    customerId: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  }): Promise<boolean> {
    const ctx: TenantContext = { tenantId: cart.tenantId };
    let name = 'there';
    let email = cart.contactEmail ?? undefined;
    let phone = cart.contactPhone ?? undefined;
    if (cart.customerId) {
      const customer = await this.prisma.customer.findUnique({ where: { id: cart.customerId } });
      if (customer) {
        // Abandoned-cart recovery is promotional: never message a customer who
        // has explicitly opted out (they get only order/delivery/return notices).
        if (customer.unsubscribedAt) return false;
        name = customer.name ?? name;
        email = email ?? customer.email ?? undefined;
        phone = phone ?? customer.phone ?? undefined;
      }
    }
    const base = process.env.APP_URL ?? 'http://localhost:5173';
    const results = await this.notifications.notify(ctx, {
      storeId: cart.storeId,
      event: 'ABANDONED_CART',
      recipientType: 'CUSTOMER',
      data: { customerName: name, customerEmail: email, customerPhone: phone, cartUrl: `${base}/cart/${cart.id}` },
    });
    return results.some((r) => r.status === 'SENT');
  }
}
