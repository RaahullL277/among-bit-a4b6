import type { PrismaClient } from '@prisma/client';
import { NotFoundError, type TenantContext } from '../context.js';
import type { ProductService } from './product.service.js';
import type { CartService } from './cart.service.js';

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
  ) {}

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
    return all.filter((p) => p.status === 'ACTIVE');
  }

  async getProduct(storeId: string, productId: string) {
    const { ctx } = await this.ctxForStore(storeId);
    const product = await this.products.get(ctx, productId);
    if (product.storeId !== storeId || product.status !== 'ACTIVE') {
      throw new NotFoundError('Product', productId);
    }
    return product;
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

  /** Begin checkout: creates a pending order + payment via the active provider. */
  async checkout(cartId: string) {
    const { ctx } = await this.ctxForCart(cartId);
    return this.carts.checkoutCart(ctx, cartId, {});
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
}
