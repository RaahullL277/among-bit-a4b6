import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { HeuristicStockScorer } from '../src/stock/scorer.js';
import type { TenantContext } from '../src/context.js';

// --- Pure scorer (no DB) ----------------------------------------------------
describe('heuristic stock scorer', () => {
  const scorer = new HeuristicStockScorer();
  const policy = { greenDays: 14, amberDays: 5, reorderPoint: 2 };

  it('is RED when out of stock or at/below reorder point', () => {
    expect(scorer.score({ inventory: 0, dailyVelocity: 1, ...policy }).status).toBe('RED');
    expect(scorer.score({ inventory: 2, dailyVelocity: 1, ...policy }).status).toBe('RED');
  });

  it('is GREEN when there are no recent sales', () => {
    const s = scorer.score({ inventory: 50, dailyVelocity: 0, ...policy });
    expect(s.status).toBe('GREEN');
    expect(s.daysOfCover).toBeNull();
  });

  it('maps days-of-cover to amber/green/red bands', () => {
    expect(scorer.score({ inventory: 30, dailyVelocity: 1, ...policy }).status).toBe('GREEN'); // 30d
    expect(scorer.score({ inventory: 10, dailyVelocity: 1, ...policy }).status).toBe('AMBER'); // 10d
    expect(scorer.score({ inventory: 9, dailyVelocity: 3, ...policy }).status).toBe('RED'); // 3d
  });
});

// --- DB-backed service ------------------------------------------------------
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('stock service', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;
  let orderNo = 0;

  async function makeVariant(inventory: number) {
    const product = await commerce.products.create(ctx, {
      storeId,
      title: `P${Math.random().toString(36).slice(2, 6)}`,
      variants: [{ priceMinor: 1000, inventory }],
    });
    return product.variants[0].id;
  }

  // Record `qty` units sold of a variant via a paid order in-window.
  async function sell(variantId: string, qty: number) {
    await prisma.order.create({
      data: {
        tenantId: ctx.tenantId,
        storeId,
        number: ++orderNo,
        status: 'PAID',
        totalMinor: 1000 * qty,
        items: { create: [{ tenantId: ctx.tenantId, variantId, title: 'x', quantity: qty, unitPriceMinor: 1000 }] },
      },
    });
  }

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Stock Test' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Stock Store', ownerEmail: 'owner@stock.example' });
    storeId = store.id;
    await commerce.integrations.configure(ctx, { storeId, provider: 'RESEND', credentials: { apiKey: 'stub' } });
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('scores variants R/A/G from inventory and sales velocity', async () => {
    const out = await makeVariant(0);
    const healthy = await makeVariant(100);
    const amber = await makeVariant(10);
    const red = await makeVariant(10);
    await sell(amber, 30); // 1/day over 30d → 10d cover → AMBER
    await sell(red, 90); // 3/day → ~3.3d cover → RED

    const statuses = await commerce.stock.getStockStatus(ctx, storeId);
    const byId = new Map(statuses.map((s) => [s.variantId, s.status]));
    expect(byId.get(out)).toBe('RED');
    expect(byId.get(healthy)).toBe('GREEN');
    expect(byId.get(amber)).toBe('AMBER');
    expect(byId.get(red)).toBe('RED');
  });

  it('alerts the store owner when a variant newly goes out of stock', async () => {
    await makeVariant(0); // fresh RED variant, previousStatus null
    const result = await commerce.stock.recomputeAndAlert();
    expect(result.scanned).toBeGreaterThan(0);

    const notes = await commerce.notifications.listNotifications(ctx, storeId);
    const alert = notes.find(
      (n) => n.event === 'OUT_OF_STOCK' && n.to === 'owner@stock.example' && n.status === 'SENT',
    );
    expect(alert).toBeTruthy();

    // Status persisted, so a second run does not re-alert.
    const second = await commerce.stock.recomputeAndAlert();
    const before = (await commerce.notifications.listNotifications(ctx, storeId)).length;
    await commerce.stock.recomputeAndAlert();
    const after = (await commerce.notifications.listNotifications(ctx, storeId)).length;
    expect(after).toBe(before);
    expect(second.scanned).toBeGreaterThan(0);
  });
});
