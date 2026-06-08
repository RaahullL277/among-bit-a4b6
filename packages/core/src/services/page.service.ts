import type { PageStatus, Prisma, PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';

/** Section block types the builder + storefront renderer both understand. */
export const SECTION_TYPES = [
  'hero',
  'rich_text',
  'image',
  'product_grid',
  'featured_product',
  'faq',
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export interface PageSection {
  id: string;
  type: SectionType;
  /** Block-specific fields (shape depends on `type`); stored verbatim as JSON. */
  data: Record<string, unknown>;
}

export interface UpsertPageInput {
  storeId: string;
  slug?: string;
  title?: string;
  sections?: PageSection[];
  metaTitle?: string;
  metaDescription?: string;
  status?: PageStatus;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Store design & page builder. Pages are ordered lists of typed sections (hero,
 * rich_text, product_grid, …) stored as JSON; the storefront renders published
 * pages and applies the store theme. The same service backs the merchant
 * builder UI and the MCP tools, so an agent can design a store programmatically.
 */
export class PageService {
  constructor(private readonly prisma: PrismaClient) {}

  private async assertStore(ctx: TenantContext, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!store) throw new NotFoundError('Store', storeId);
  }

  /** Validate a slug and the section list; returns normalized sections. */
  private normalize(input: { slug?: string; sections?: PageSection[] }): PageSection[] | undefined {
    if (input.slug !== undefined && !SLUG_RE.test(input.slug)) {
      throw new ValidationError('Slug must be lowercase letters, numbers and dashes (e.g. "about-us").');
    }
    if (input.sections === undefined) return undefined;
    if (!Array.isArray(input.sections)) throw new ValidationError('Sections must be an array.');
    return input.sections.map((s, i) => {
      if (!s || typeof s !== 'object') throw new ValidationError(`Section ${i} is invalid.`);
      if (!SECTION_TYPES.includes(s.type)) {
        throw new ValidationError(`Unknown section type "${s.type}". Allowed: ${SECTION_TYPES.join(', ')}.`);
      }
      return {
        id: s.id || `sec_${Math.random().toString(36).slice(2, 10)}`,
        type: s.type,
        data: (s.data && typeof s.data === 'object' ? s.data : {}) as Record<string, unknown>,
      };
    });
  }

  // --- Merchant / agent CRUD ------------------------------------------------

  async list(ctx: TenantContext, storeId: string) {
    await this.assertStore(ctx, storeId);
    return this.prisma.storePage.findMany({
      where: { tenantId: ctx.tenantId, storeId },
      orderBy: [{ slug: 'asc' }],
    });
  }

  async get(ctx: TenantContext, id: string) {
    const page = await this.prisma.storePage.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!page) throw new NotFoundError('Page', id);
    return page;
  }

  async create(ctx: TenantContext, input: UpsertPageInput) {
    await this.assertStore(ctx, input.storeId);
    const slug = (input.slug ?? '').trim();
    if (!slug) throw new ValidationError('A page slug is required (e.g. "home").');
    if (!input.title?.trim()) throw new ValidationError('A page title is required.');
    const sections = this.normalize({ slug, sections: input.sections ?? [] })!;

    const existing = await this.prisma.storePage.findUnique({
      where: { storeId_slug: { storeId: input.storeId, slug } },
      select: { id: true },
    });
    if (existing) throw new ValidationError(`A page with slug "${slug}" already exists.`);

    return this.prisma.storePage.create({
      data: {
        tenantId: ctx.tenantId,
        storeId: input.storeId,
        slug,
        title: input.title.trim(),
        sections: sections as unknown as Prisma.InputJsonValue,
        metaTitle: input.metaTitle,
        metaDescription: input.metaDescription,
        status: input.status ?? 'DRAFT',
      },
    });
  }

  async update(ctx: TenantContext, id: string, patch: UpsertPageInput) {
    const page = await this.get(ctx, id);
    const slug = patch.slug !== undefined ? patch.slug.trim() : undefined;
    const sections = this.normalize({ slug, sections: patch.sections });

    if (slug && slug !== page.slug) {
      const clash = await this.prisma.storePage.findUnique({
        where: { storeId_slug: { storeId: page.storeId, slug } },
        select: { id: true },
      });
      if (clash) throw new ValidationError(`A page with slug "${slug}" already exists.`);
    }

    const data: Prisma.StorePageUpdateInput = {};
    if (slug) data.slug = slug;
    if (patch.title !== undefined) {
      if (!patch.title.trim()) throw new ValidationError('A page title is required.');
      data.title = patch.title.trim();
    }
    if (sections !== undefined) data.sections = sections as unknown as Prisma.InputJsonValue;
    if (patch.metaTitle !== undefined) data.metaTitle = patch.metaTitle;
    if (patch.metaDescription !== undefined) data.metaDescription = patch.metaDescription;
    if (patch.status !== undefined) data.status = patch.status;

    return this.prisma.storePage.update({ where: { id }, data });
  }

  async setStatus(ctx: TenantContext, id: string, status: PageStatus) {
    await this.get(ctx, id);
    return this.prisma.storePage.update({ where: { id }, data: { status } });
  }

  async remove(ctx: TenantContext, id: string) {
    await this.get(ctx, id);
    await this.prisma.storePage.delete({ where: { id } });
    return { id, deleted: true };
  }

  // --- Theme ----------------------------------------------------------------

  async getTheme(ctx: TenantContext, storeId: string) {
    await this.assertStore(ctx, storeId);
    const theme = await this.prisma.storeTheme.findUnique({ where: { storeId } });
    return theme ?? { storeId, primaryColor: '#1c1917', accentColor: '#4f46e5', logoText: null, settings: {}, isDefault: true };
  }

  async setTheme(
    ctx: TenantContext,
    input: { storeId: string; primaryColor?: string; accentColor?: string; logoText?: string; settings?: Record<string, unknown> },
  ) {
    await this.assertStore(ctx, input.storeId);
    const color = (c?: string) => {
      if (c === undefined) return undefined;
      if (!/^#[0-9a-fA-F]{6}$/.test(c)) throw new ValidationError('Colors must be hex like "#1c1917".');
      return c;
    };
    const data = {
      primaryColor: color(input.primaryColor) ?? undefined,
      accentColor: color(input.accentColor) ?? undefined,
      logoText: input.logoText,
      settings: (input.settings ?? undefined) as Prisma.InputJsonValue | undefined,
    };
    return this.prisma.storeTheme.upsert({
      where: { storeId: input.storeId },
      create: {
        tenantId: ctx.tenantId,
        storeId: input.storeId,
        primaryColor: data.primaryColor ?? '#1c1917',
        accentColor: data.accentColor ?? '#4f46e5',
        logoText: input.logoText,
        settings: (input.settings ?? {}) as Prisma.InputJsonValue,
      },
      update: data,
    });
  }

  // --- Public render (storefront) -------------------------------------------

  /** Theme for a store, derived from defaults when unset. Public (no ctx). */
  async publicTheme(storeId: string) {
    const theme = await this.prisma.storeTheme.findUnique({
      where: { storeId },
      select: { primaryColor: true, accentColor: true, logoText: true, settings: true },
    });
    return theme ?? { primaryColor: '#1c1917', accentColor: '#4f46e5', logoText: null, settings: {} };
  }

  /**
   * A published page with its product references resolved to live data, so the
   * storefront can render it without extra round-trips. Returns null if the
   * store has no published page at that slug.
   */
  async renderPage(storeId: string, slug: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { id: true, status: true } });
    if (!store || store.status !== 'ACTIVE') return null;

    const page = await this.prisma.storePage.findFirst({
      where: { storeId, slug, status: 'PUBLISHED' },
    });
    if (!page) return null;

    const sections = Array.isArray(page.sections) ? (page.sections as unknown as PageSection[]) : [];
    const resolved = await this.resolveSections(storeId, sections);
    return {
      slug: page.slug,
      title: page.title,
      metaTitle: page.metaTitle,
      metaDescription: page.metaDescription,
      sections: resolved,
    };
  }

  /** Public wrapper so experiments can render variant sections with live data. */
  async renderSections(storeId: string, sections: PageSection[]) {
    return this.resolveSections(storeId, sections);
  }

  /** Attach live product data to product_grid / featured_product sections. */
  private async resolveSections(storeId: string, sections: PageSection[]) {
    const wantIds = new Set<string>();
    let needAll = false;
    for (const s of sections) {
      if (s.type === 'featured_product' && typeof s.data.productId === 'string') wantIds.add(s.data.productId);
      if (s.type === 'product_grid') {
        if (s.data.mode === 'manual' && Array.isArray(s.data.productIds)) {
          for (const id of s.data.productIds) if (typeof id === 'string') wantIds.add(id);
        } else {
          needAll = true;
        }
      }
    }

    const products = await this.prisma.product.findMany({
      where: { storeId, status: 'ACTIVE', ...(needAll ? {} : { id: { in: [...wantIds] } }) },
      include: { variants: { orderBy: { priceMinor: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    const card = (p: (typeof products)[number]) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      variant: p.variants[0]
        ? { id: p.variants[0].id, priceMinor: p.variants[0].priceMinor, currency: p.variants[0].currency }
        : null,
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    return sections.map((s) => {
      if (s.type === 'featured_product') {
        const p = typeof s.data.productId === 'string' ? byId.get(s.data.productId) : undefined;
        return { ...s, product: p ? card(p) : null };
      }
      if (s.type === 'product_grid') {
        const limit = typeof s.data.limit === 'number' ? s.data.limit : undefined;
        let list: typeof products;
        if (s.data.mode === 'manual' && Array.isArray(s.data.productIds)) {
          list = (s.data.productIds as string[]).map((id) => byId.get(id)).filter((p): p is (typeof products)[number] => Boolean(p));
        } else {
          list = products;
        }
        return { ...s, products: (limit ? list.slice(0, limit) : list).map(card) };
      }
      return s;
    });
  }
}
