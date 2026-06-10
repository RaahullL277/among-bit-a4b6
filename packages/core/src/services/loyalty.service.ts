import type { LoyaltyTxnType, Prisma, PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';

export interface LoyaltyProgramInput {
  storeId: string;
  enabled?: boolean;
  pointsPerCurrencyUnit?: number;
  redeemValueMinorPerPoint?: number;
  minRedeemPoints?: number;
  signupBonus?: number;
  tiers?: { name: string; minPoints: number }[];
}

const DEFAULT_PROGRAM = {
  enabled: false,
  pointsPerCurrencyUnit: 1,
  redeemValueMinorPerPoint: 10,
  minRedeemPoints: 100,
  signupBonus: 0,
  tiers: [] as { name: string; minPoints: number }[],
};

type Tier = { name: string; minPoints: number };

/**
 * Loyalty / rewards (LoyaltyLion-style). A per-store points program awards
 * points on paid orders and lets customers redeem them for a checkout discount.
 * Lifetime points drive tiers. A signed ledger (LoyaltyTransaction) is the
 * source of truth; the account row caches the running balance + lifetime total.
 */
export class LoyaltyService {
  constructor(private readonly prisma: PrismaClient) {}

  // --- Program config -------------------------------------------------------

  private async assertStore(ctx: TenantContext, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!store) throw new NotFoundError('Store', storeId);
  }

  async getProgram(ctx: TenantContext, storeId: string) {
    await this.assertStore(ctx, storeId);
    const row = await this.prisma.loyaltyProgram.findUnique({ where: { storeId } });
    return row ?? { storeId, ...DEFAULT_PROGRAM, isDefault: true };
  }

  /** Resolve the effective program (row or defaults) without a tenant ctx. */
  private async program(storeId: string) {
    const row = await this.prisma.loyaltyProgram.findUnique({ where: { storeId } });
    return row ?? { storeId, ...DEFAULT_PROGRAM };
  }

  async setProgram(ctx: TenantContext, input: LoyaltyProgramInput) {
    await this.assertStore(ctx, input.storeId);
    const nonNeg = (n: number | undefined, label: string) => {
      if (n === undefined) return undefined;
      if (!Number.isFinite(n) || n < 0) throw new ValidationError(`${label} must be a non-negative number.`);
      return Math.round(n);
    };
    const tiers = input.tiers
      ? [...input.tiers].filter((t) => t.name && Number.isFinite(t.minPoints)).sort((a, b) => a.minPoints - b.minPoints)
      : undefined;

    const data = {
      enabled: input.enabled,
      pointsPerCurrencyUnit: nonNeg(input.pointsPerCurrencyUnit, 'Points per unit'),
      redeemValueMinorPerPoint: nonNeg(input.redeemValueMinorPerPoint, 'Redemption value'),
      minRedeemPoints: nonNeg(input.minRedeemPoints, 'Minimum redemption'),
      signupBonus: nonNeg(input.signupBonus, 'Signup bonus'),
      tiers: tiers as unknown as Prisma.InputJsonValue | undefined,
    };
    return this.prisma.loyaltyProgram.upsert({
      where: { storeId: input.storeId },
      create: {
        tenantId: ctx.tenantId,
        storeId: input.storeId,
        enabled: data.enabled ?? DEFAULT_PROGRAM.enabled,
        pointsPerCurrencyUnit: data.pointsPerCurrencyUnit ?? DEFAULT_PROGRAM.pointsPerCurrencyUnit,
        redeemValueMinorPerPoint: data.redeemValueMinorPerPoint ?? DEFAULT_PROGRAM.redeemValueMinorPerPoint,
        minRedeemPoints: data.minRedeemPoints ?? DEFAULT_PROGRAM.minRedeemPoints,
        signupBonus: data.signupBonus ?? DEFAULT_PROGRAM.signupBonus,
        tiers: (tiers ?? []) as unknown as Prisma.InputJsonValue,
      },
      update: data,
    });
  }

  private tierFor(lifetime: number, tiers: Tier[]): string | null {
    let best: Tier | null = null;
    for (const t of tiers) if (lifetime >= t.minPoints && (!best || t.minPoints > best.minPoints)) best = t;
    return best?.name ?? null;
  }

  // --- Accounts -------------------------------------------------------------

  private async ensureAccount(tenantId: string, storeId: string, customerId: string) {
    // Upsert avoids a find-then-create race (LoyaltyAccount.customerId is unique).
    return this.prisma.loyaltyAccount.upsert({
      where: { customerId },
      create: { tenantId, storeId, customerId },
      update: {},
    });
  }

  /** Apply a signed points delta to a customer, recording a ledger entry. */
  private async post(
    ctx: TenantContext,
    customer: { id: string; storeId: string },
    type: LoyaltyTxnType,
    points: number,
    note?: string,
    orderId?: string,
  ) {
    const account = await this.ensureAccount(ctx.tenantId, customer.storeId, customer.id);
    const program = await this.program(customer.storeId);

    // Atomic, race-free balance change: the conditional updateMany enforces
    // non-negativity at the row level (a concurrent spend cannot double-spend),
    // and the ledger entry shares the same transaction as the balance change.
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.loyaltyAccount.updateMany({
        where: { id: account.id, ...(points < 0 ? { pointsBalance: { gte: -points } } : {}) },
        data: {
          pointsBalance: { increment: points },
          lifetimePoints: points > 0 ? { increment: points } : undefined,
        },
      });
      if (updated.count === 0) throw new ValidationError('Insufficient points balance.');
      const fresh = await tx.loyaltyAccount.findUniqueOrThrow({ where: { id: account.id }, select: { pointsBalance: true, lifetimePoints: true } });
      const tier = this.tierFor(fresh.lifetimePoints, (program.tiers as Tier[]) ?? []);
      await tx.loyaltyAccount.update({ where: { id: account.id }, data: { tier } });
      await tx.loyaltyTransaction.create({ data: { tenantId: ctx.tenantId, accountId: account.id, type, points, note, orderId } });
      return { balance: fresh.pointsBalance, lifetime: fresh.lifetimePoints, tier };
    });
  }

  async account(ctx: TenantContext, customerId: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, tenantId: ctx.tenantId }, select: { id: true, storeId: true, name: true, email: true } });
    if (!customer) throw new NotFoundError('Customer', customerId);
    const account = await this.prisma.loyaltyAccount.findUnique({
      where: { customerId },
      include: { transactions: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
    return {
      customerId,
      name: customer.name,
      email: customer.email,
      pointsBalance: account?.pointsBalance ?? 0,
      lifetimePoints: account?.lifetimePoints ?? 0,
      tier: account?.tier ?? null,
      transactions: account?.transactions ?? [],
    };
  }

  async listAccounts(ctx: TenantContext, storeId: string) {
    await this.assertStore(ctx, storeId);
    const accounts = await this.prisma.loyaltyAccount.findMany({
      where: { tenantId: ctx.tenantId, storeId },
      include: { customer: { select: { name: true, email: true } } },
      orderBy: { pointsBalance: 'desc' },
      take: 200,
    });
    return accounts.map((a) => ({
      customerId: a.customerId,
      name: a.customer.name,
      email: a.customer.email,
      pointsBalance: a.pointsBalance,
      lifetimePoints: a.lifetimePoints,
      tier: a.tier,
    }));
  }

  /** Public storefront balance lookup by email. */
  async publicBalance(storeId: string, email: string) {
    const program = await this.program(storeId);
    if (!email) return { enabled: program.enabled, found: false };
    const customer = await this.prisma.customer.findFirst({
      where: { storeId, email: { equals: email, mode: 'insensitive' } },
      select: { id: true, name: true },
    });
    const account = customer ? await this.prisma.loyaltyAccount.findUnique({ where: { customerId: customer.id } }) : null;
    return {
      enabled: program.enabled,
      pointsPerCurrencyUnit: program.pointsPerCurrencyUnit,
      redeemValueMinorPerPoint: program.redeemValueMinorPerPoint,
      minRedeemPoints: program.minRedeemPoints,
      found: Boolean(customer),
      name: customer?.name ?? null,
      pointsBalance: account?.pointsBalance ?? 0,
      tier: account?.tier ?? null,
    };
  }

  // --- Earn / award ---------------------------------------------------------

  /** Award points for a paid order. Idempotent per order. Best-effort caller. */
  async earnForOrder(ctx: TenantContext, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId: ctx.tenantId },
      select: { id: true, storeId: true, customerId: true, totalMinor: true },
    });
    if (!order || !order.customerId) return null;
    const program = await this.program(order.storeId);
    if (!program.enabled || program.pointsPerCurrencyUnit <= 0) return null;

    // Skip if we already awarded for this order.
    const account = await this.prisma.loyaltyAccount.findUnique({ where: { customerId: order.customerId }, select: { id: true } });
    if (account) {
      const dup = await this.prisma.loyaltyTransaction.findFirst({ where: { accountId: account.id, orderId: order.id, type: 'EARN' }, select: { id: true } });
      if (dup) return null;
    }

    const points = Math.floor(order.totalMinor / 100) * program.pointsPerCurrencyUnit;
    if (points <= 0) return null;
    return this.post(ctx, { id: order.customerId, storeId: order.storeId }, 'EARN', points, 'Order purchase', order.id);
  }

  /** Manual adjustment or signup bonus by a merchant/agent. */
  async award(ctx: TenantContext, customerId: string, points: number, note?: string, type: LoyaltyTxnType = 'ADJUST') {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, tenantId: ctx.tenantId }, select: { id: true, storeId: true } });
    if (!customer) throw new NotFoundError('Customer', customerId);
    if (!Number.isInteger(points) || points === 0) throw new ValidationError('Points must be a non-zero integer.');
    return this.post(ctx, customer, type, points, note);
  }

  // --- Redeem ---------------------------------------------------------------

  /**
   * Redeem points for a discount. `maxDiscountMinor` (e.g. the cart subtotal)
   * caps the value so a redemption never exceeds the order; only the points
   * actually needed are deducted. Returns the discount + points used.
   */
  async redeem(ctx: TenantContext, customerId: string, points: number, maxDiscountMinor?: number) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, tenantId: ctx.tenantId }, select: { id: true, storeId: true } });
    if (!customer) throw new NotFoundError('Customer', customerId);
    const program = await this.program(customer.storeId);
    if (!program.enabled) throw new ValidationError('The loyalty program is not enabled.');

    const want = Math.floor(Number(points));
    if (want <= 0) throw new ValidationError('Points to redeem must be positive.');
    if (want < program.minRedeemPoints) throw new ValidationError(`You must redeem at least ${program.minRedeemPoints} points.`);

    const account = await this.prisma.loyaltyAccount.findUnique({ where: { customerId } });
    if (!account || account.pointsBalance < want) throw new ValidationError('Insufficient points balance.');

    let usedPoints = want;
    let discountMinor = want * program.redeemValueMinorPerPoint;
    if (maxDiscountMinor !== undefined && discountMinor > maxDiscountMinor) {
      discountMinor = maxDiscountMinor;
      usedPoints = Math.ceil(maxDiscountMinor / program.redeemValueMinorPerPoint);
    }
    const res = await this.post(ctx, customer, 'REDEEM', -usedPoints, 'Redeemed for discount');
    return { discountMinor, pointsUsed: usedPoints, balance: res.balance };
  }
}
