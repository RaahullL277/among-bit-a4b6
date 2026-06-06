import type { PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';

interface SettingsShape {
  taxBps: number;
  taxLabel: string;
  pricesIncludeTax: boolean;
  flatShippingMinor: number;
  freeShippingOverMinor: number | null;
  requireAddress: boolean;
  requireLegalAcceptance: boolean;
}
const DEFAULTS: SettingsShape = {
  taxBps: 0,
  taxLabel: 'Tax',
  pricesIncludeTax: false,
  flatShippingMinor: 0,
  freeShippingOverMinor: null,
  // Opt-in: stores selling physical goods turn this on to require a delivery address.
  requireAddress: false,
  // Opt-in: require the buyer to accept the published legal policies at checkout.
  requireLegalAcceptance: false,
};

export interface CheckoutQuote {
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  taxLabel: string;
  shippingMinor: number;
  totalMinor: number;
  pricesIncludeTax: boolean;
}

/**
 * Per-store tax & shipping settings, and the authoritative quote that turns an
 * item subtotal (after discount) into tax + shipping + the final charged total.
 */
export class CheckoutSettingsService {
  constructor(private readonly prisma: PrismaClient) {}

  private async assertStore(ctx: TenantContext, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!store) throw new NotFoundError('Store', storeId);
  }

  async resolve(storeId: string): Promise<SettingsShape> {
    const row = await this.prisma.checkoutSettings.findUnique({ where: { storeId } });
    return row
      ? {
          taxBps: row.taxBps,
          taxLabel: row.taxLabel,
          pricesIncludeTax: row.pricesIncludeTax,
          flatShippingMinor: row.flatShippingMinor,
          freeShippingOverMinor: row.freeShippingOverMinor,
          requireAddress: row.requireAddress,
          requireLegalAcceptance: row.requireLegalAcceptance,
        }
      : { ...DEFAULTS };
  }

  async get(ctx: TenantContext, storeId: string) {
    await this.assertStore(ctx, storeId);
    const row = await this.prisma.checkoutSettings.findUnique({ where: { storeId } });
    return row ?? { storeId, ...DEFAULTS, isDefault: true };
  }

  async set(ctx: TenantContext, input: { storeId: string } & Partial<SettingsShape>) {
    await this.assertStore(ctx, input.storeId);
    const { storeId, ...rest } = input;
    if (rest.taxBps != null && (rest.taxBps < 0 || rest.taxBps > 10000)) throw new ValidationError('taxBps must be between 0 and 10000.');
    if (rest.flatShippingMinor != null && rest.flatShippingMinor < 0) throw new ValidationError('flatShippingMinor must be non-negative.');
    return this.prisma.checkoutSettings.upsert({
      where: { storeId },
      create: { tenantId: ctx.tenantId, storeId, ...DEFAULTS, ...rest },
      update: rest,
    });
  }

  /** Turn an item subtotal + discount into the tax/shipping/total breakdown. */
  async quote(storeId: string, subtotalMinor: number, discountMinor: number): Promise<CheckoutQuote> {
    const s = await this.resolve(storeId);
    const taxableBase = Math.max(0, subtotalMinor - discountMinor);
    const shippingMinor = s.freeShippingOverMinor != null && taxableBase >= s.freeShippingOverMinor ? 0 : s.flatShippingMinor;

    let taxMinor = 0;
    let totalMinor: number;
    if (s.taxBps > 0 && s.pricesIncludeTax) {
      // Prices already include tax — extract it for display; don't add it again.
      taxMinor = Math.round((taxableBase * s.taxBps) / (10000 + s.taxBps));
      totalMinor = taxableBase + shippingMinor;
    } else if (s.taxBps > 0) {
      taxMinor = Math.round((taxableBase * s.taxBps) / 10000);
      totalMinor = taxableBase + taxMinor + shippingMinor;
    } else {
      totalMinor = taxableBase + shippingMinor;
    }
    return { subtotalMinor, discountMinor, taxMinor, taxLabel: s.taxLabel, shippingMinor, totalMinor, pricesIncludeTax: s.pricesIncludeTax };
  }
}
