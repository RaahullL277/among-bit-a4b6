import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { STORE_TEMPLATES } from '../src/templates/store-templates.js';
import { NotFoundError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);
const CATEGORIES = ['fashion', 'lifestyle', 'cosmetics', 'jewellery'] as const;

describe('store templates (catalog)', () => {
  it('ships 5 templates for each of the four categories (20 total)', () => {
    expect(STORE_TEMPLATES).toHaveLength(20);
    for (const cat of CATEGORIES) {
      expect(STORE_TEMPLATES.filter((t) => t.category === cat)).toHaveLength(5);
    }
    // Every template has a distinct id, a theme, and home-page sections.
    const ids = new Set(STORE_TEMPLATES.map((t) => t.id));
    expect(ids.size).toBe(20);
    for (const t of STORE_TEMPLATES) {
      expect(t.theme.primaryColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(t.theme.accentColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(t.sections.length).toBeGreaterThan(0);
    }
  });
});

describe.skipIf(!hasDb)('template service (apply)', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Template Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Template Store' });
    storeId = store.id;
    await commerce.products.create(ctx, { storeId, title: 'Item', status: 'ACTIVE', variants: [{ priceMinor: 10000 }] });
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('lists templates and filters by category', () => {
    expect(commerce.templates.list()).toHaveLength(20);
    const jewellery = commerce.templates.list('jewellery');
    expect(jewellery).toHaveLength(5);
    expect(jewellery.every((t) => t.category === 'jewellery')).toBe(true);
    // List omits the heavy section payload (returns a count instead).
    expect(typeof jewellery[0].sections).toBe('number');
    expect(() => commerce.templates.get('nope')).toThrow(NotFoundError);
  });

  it('applies a template: sets the theme and publishes the home page', async () => {
    const res = await commerce.templates.apply(ctx, storeId, 'cosmetics-clean-beauty');
    expect(res.published).toBe(true);
    expect(res.theme.accentColor).toBe('#E8B4B8');
    expect(res.storefrontUrl).toContain(`?store=${storeId}`);

    // The storefront now serves a published home page with the template sections,
    // and the store theme matches.
    const page = await commerce.pages.renderPage(storeId, 'home');
    expect(page?.sections.some((s: any) => s.type === 'hero')).toBe(true);
    const theme = await commerce.pages.publicTheme(storeId);
    expect(theme.primaryColor).toBe('#2E2A26');

    // Re-applying a different template updates (not duplicates) the home page.
    await commerce.templates.apply(ctx, storeId, 'jewellery-classic-gold');
    const pages = await commerce.pages.list(ctx, storeId);
    expect(pages.filter((p) => p.slug === 'home')).toHaveLength(1);
    const theme2 = await commerce.pages.publicTheme(storeId);
    expect(theme2.accentColor).toBe('#D4AF37');
  });

  it('launches a store directly from a template', async () => {
    const launched = await commerce.onboarding.launchStore(ctx, {
      name: 'Glow Bar',
      templateId: 'cosmetics-glow',
      products: [{ title: 'Serum', priceMinor: 90000 }],
    });
    expect(launched.published).toBe(true);
    const theme = await commerce.pages.publicTheme(launched.storeId);
    expect(theme.accentColor).toBe('#F4A259'); // from the template
  });
});
