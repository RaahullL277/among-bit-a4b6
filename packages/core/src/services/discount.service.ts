import type { DiscountType, PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';

export interface CreateDiscountInput {
  storeId: string;
  code: string;
  type?: DiscountType;
  value: number;
  minSpendMinor?: number;
  maxRedemptions?: number | null;
  startsAt?: string | Date | null;
  expiresAt?: string | Date | null;
  active?: boolean;
}

/**
 * Storefront coupon/discount codes — percent or fixed off, with optional minimum
 * spend, redemption cap, and validity window. Validated + applied at checkout.
 */
export class DiscountService {
  constructor(private readonly prisma: PrismaClient) {}

  private async assertStore(ctx: TenantContext, storeId: string) {
    const s = await this.prisma.store.findFirst({ where: { id: storeId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!s) throw new NotFoundError('Store', storeId);
  }

  private norm(code: string): string {
    return String(code ?? '').trim().toUpperCase();
  }

  async create(ctx: TenantContext, input: CreateDiscountInput) {
    await this.assertStore(ctx, input.storeId);
    const code = this.norm(input.code);
    if (!code) throw new ValidationError('A discount code is required.');
    const type = input.type ?? 'PERCENT';
    const value = Math.round(input.value);
    if (type === 'PERCENT' && (value <= 0 || value > 100)) throw new ValidationError('A percent discount must be between 1 and 100.');
    if (type === 'FIXED' && value <= 0) throw new ValidationError('A fixed discount must be positive (minor units).');
    const clash = await this.prisma.discount.findUnique({ where: { storeId_code: { storeId: input.storeId, code } } });
    if (clash) throw new ValidationError(`A discount with code "${code}" already exists.`);
    return this.prisma.discount.create({
      data: {
        tenantId: ctx.tenantId,
        storeId: input.storeId,
        code,
        type,
        value,
        minSpendMinor: Math.max(0, Math.round(input.minSpendMinor ?? 0)),
        maxRedemptions: input.maxRedemptions ?? null,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        active: input.active ?? true,
      },
    });
  }

  async list(ctx: TenantContext, storeId: string) {
    await this.assertStore(ctx, storeId);
    return this.prisma.discount.findMany({ where: { tenantId: ctx.tenantId, storeId }, orderBy: { createdAt: 'desc' } });
  }

  async setActive(ctx: TenantContext, id: string, active: boolean) {
    const d = await this.prisma.discount.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!d) throw new NotFoundError('Discount', id);
    return this.prisma.discount.update({ where: { id }, data: { active } });
  }

  async remove(ctx: TenantContext, id: string) {
    const d = await this.prisma.discount.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!d) throw new NotFoundError('Discount', id);
    await this.prisma.discount.delete({ where: { id } });
    return { id, deleted: true };
  }

  /**
   * Validate a code against an order subtotal. Returns the discount in minor
   * units (clamped to the subtotal) or a reason it can't be applied. Public-safe.
   */
  async validate(storeId: string, code: string, subtotalMinor: number): Promise<{ valid: boolean; code?: string; discountMinor: number; reason?: string }> {
    const c = this.norm(code);
    if (!c) return { valid: false, discountMinor: 0, reason: 'no_code' };
    const d = await this.prisma.discount.findUnique({ where: { storeId_code: { storeId, code: c } } });
    const now = new Date();
    if (!d || !d.active) return { valid: false, discountMinor: 0, reason: 'invalid' };
    if (d.startsAt && d.startsAt > now) return { valid: false, discountMinor: 0, reason: 'not_started' };
    if (d.expiresAt && d.expiresAt < now) return { valid: false, discountMinor: 0, reason: 'expired' };
    if (d.maxRedemptions != null && d.redeemedCount >= d.maxRedemptions) return { valid: false, discountMinor: 0, reason: 'limit_reached' };
    if (subtotalMinor < d.minSpendMinor) return { valid: false, discountMinor: 0, reason: 'min_spend' };
    const raw = d.type === 'PERCENT' ? Math.round((subtotalMinor * d.value) / 100) : d.value;
    const discountMinor = Math.max(0, Math.min(raw, subtotalMinor));
    return { valid: discountMinor > 0, code: d.code, discountMinor, reason: discountMinor > 0 ? undefined : 'no_effect' };
  }

  /** Count a redemption after a successful checkout (best-effort, capped). */
  async redeem(storeId: string, code: string) {
    const c = this.norm(code);
    if (!c) return;
    await this.prisma.discount.updateMany({ where: { storeId, code: c }, data: { redeemedCount: { increment: 1 } } }).catch(() => undefined);
  }
}
