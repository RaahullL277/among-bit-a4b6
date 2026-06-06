import type { PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';

export interface SeoSettingsInput {
  storeId: string;
  titleTemplate?: string;
  defaultDescription?: string;
  indexable?: boolean;
}

type Severity = 'error' | 'warning' | 'good';
interface Issue {
  entityType: 'product' | 'page' | 'image' | 'store';
  entityId: string;
  entityTitle: string;
  code: string;
  severity: Severity;
  message: string;
}

const DEFAULTS = { titleTemplate: '{title} | {storeName}', defaultDescription: null as string | null, indexable: true };

// SEO copy length guidance (Google-ish).
const TITLE_MIN = 15;
const TITLE_MAX = 60;
const DESC_MIN = 50;
const DESC_MAX = 160;
const LARGE_IMAGE_BYTES = 200_000; // 200 KB — flag for compression

/**
 * SEO & performance (Plug-in-SEO style). Audits the live catalog + pages for
 * on-page SEO issues and produces a health score, renders meta/JSON-LD for the
 * storefront, and generates sitemap.xml / robots.txt. Image weight feeds a
 * lightweight performance score (paired with the image-optimization service).
 */
export class SeoService {
  constructor(private readonly prisma: PrismaClient) {}

  private async assertStore(ctx: TenantContext, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!store) throw new NotFoundError('Store', storeId);
  }

  // --- Settings -------------------------------------------------------------

  async getSettings(ctx: TenantContext, storeId: string) {
    await this.assertStore(ctx, storeId);
    const row = await this.prisma.seoSettings.findUnique({ where: { storeId } });
    return row ?? { storeId, ...DEFAULTS, isDefault: true };
  }

  private async settings(storeId: string) {
    const row = await this.prisma.seoSettings.findUnique({ where: { storeId } });
    return row ?? { storeId, ...DEFAULTS };
  }

  async setSettings(ctx: TenantContext, input: SeoSettingsInput) {
    await this.assertStore(ctx, input.storeId);
    if (input.titleTemplate !== undefined && !input.titleTemplate.includes('{title}')) {
      throw new ValidationError('The title template must include {title}.');
    }
    const data = {
      titleTemplate: input.titleTemplate,
      defaultDescription: input.defaultDescription,
      indexable: input.indexable,
    };
    return this.prisma.seoSettings.upsert({
      where: { storeId: input.storeId },
      create: {
        tenantId: ctx.tenantId,
        storeId: input.storeId,
        titleTemplate: input.titleTemplate ?? DEFAULTS.titleTemplate,
        defaultDescription: input.defaultDescription,
        indexable: input.indexable ?? DEFAULTS.indexable,
      },
      update: data,
    });
  }

  // --- Audit ----------------------------------------------------------------

  async audit(ctx: TenantContext, storeId: string) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId: ctx.tenantId },
      select: { id: true, name: true },
    });
    if (!store) throw new NotFoundError('Store', storeId);

    const [products, pages, images] = await Promise.all([
      this.prisma.product.findMany({
        where: { storeId, status: 'ACTIVE' },
        select: { id: true, title: true, description: true, metaTitle: true, metaDescription: true, _count: { select: { images: true } } },
      }),
      this.prisma.storePage.findMany({ where: { storeId, status: 'PUBLISHED' }, select: { id: true, slug: true, title: true, metaTitle: true, metaDescription: true } }),
      this.prisma.imageAsset.findMany({ where: { storeId }, select: { id: true, url: true, alt: true, originalBytes: true, optimized: true, optimizedBytes: true } }),
    ]);

    const issues: Issue[] = [];
    const add = (i: Issue) => issues.push(i);

    for (const p of products) {
      const metaTitle = p.metaTitle ?? p.title;
      if (!p.metaTitle) add({ entityType: 'product', entityId: p.id, entityTitle: p.title, code: 'missing_meta_title', severity: 'warning', message: 'No SEO title set (falling back to the product name).' });
      if (metaTitle.length > TITLE_MAX) add({ entityType: 'product', entityId: p.id, entityTitle: p.title, code: 'title_too_long', severity: 'warning', message: `SEO title is ${metaTitle.length} chars (keep ≤ ${TITLE_MAX}).` });
      if (metaTitle.length < TITLE_MIN) add({ entityType: 'product', entityId: p.id, entityTitle: p.title, code: 'title_too_short', severity: 'warning', message: `SEO title is short (${metaTitle.length} chars).` });
      const desc = p.metaDescription ?? p.description ?? '';
      if (!desc) add({ entityType: 'product', entityId: p.id, entityTitle: p.title, code: 'missing_description', severity: 'error', message: 'No meta description.' });
      else if (desc.length > DESC_MAX) add({ entityType: 'product', entityId: p.id, entityTitle: p.title, code: 'description_too_long', severity: 'warning', message: `Meta description is ${desc.length} chars (keep ≤ ${DESC_MAX}).` });
      else if (desc.length < DESC_MIN) add({ entityType: 'product', entityId: p.id, entityTitle: p.title, code: 'description_too_short', severity: 'warning', message: `Meta description is short (${desc.length} chars).` });
      if (p._count.images === 0) add({ entityType: 'product', entityId: p.id, entityTitle: p.title, code: 'no_images', severity: 'warning', message: 'No product images.' });
    }

    for (const pg of pages) {
      if (!pg.metaTitle) add({ entityType: 'page', entityId: pg.id, entityTitle: pg.title, code: 'missing_meta_title', severity: 'warning', message: `Page "/${pg.slug}" has no SEO title.` });
      if (!pg.metaDescription) add({ entityType: 'page', entityId: pg.id, entityTitle: pg.title, code: 'missing_description', severity: 'warning', message: `Page "/${pg.slug}" has no meta description.` });
    }

    let unoptimized = 0;
    let estimatedSavingsBytes = 0;
    for (const img of images) {
      if (!img.alt) add({ entityType: 'image', entityId: img.id, entityTitle: img.url, code: 'missing_alt', severity: 'warning', message: 'Image is missing alt text (hurts SEO + accessibility).' });
      if (!img.optimized) {
        unoptimized++;
        estimatedSavingsBytes += Math.floor(img.originalBytes * 0.65);
        if (img.originalBytes > LARGE_IMAGE_BYTES) add({ entityType: 'image', entityId: img.id, entityTitle: img.url, code: 'large_image', severity: 'warning', message: `Large image (${Math.round(img.originalBytes / 1024)} KB) — compress it.` });
      }
    }

    // Score: start at 100, subtract per issue (errors weigh more), clamp 0..100.
    const errors = issues.filter((i) => i.severity === 'error').length;
    const warnings = issues.filter((i) => i.severity === 'warning').length;
    const score = Math.max(0, Math.min(100, 100 - errors * 8 - warnings * 3));

    // Performance score from image weight.
    const imageCount = images.length;
    const speedScore = imageCount === 0 ? 100 : Math.max(0, Math.min(100, 100 - unoptimized * 5 - images.filter((i) => !i.optimized && i.originalBytes > LARGE_IMAGE_BYTES).length * 5));

    return {
      score,
      counts: { errors, warnings, total: issues.length, products: products.length, pages: pages.length, images: imageCount },
      issues,
      performance: { imageCount, unoptimized, estimatedSavingsBytes, speedScore },
    };
  }

  // --- Storefront artifacts -------------------------------------------------

  private baseUrl(storeId: string) {
    const base = process.env.STOREFRONT_URL ?? 'http://localhost:5174';
    return `${base.replace(/\/$/, '')}/?store=${storeId}`;
  }

  /** Resolved meta + Product JSON-LD for a storefront product page. */
  async productMeta(storeId: string, productId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { name: true, currency: true } });
    const product = await this.prisma.product.findFirst({
      where: { id: productId, storeId, status: 'ACTIVE' },
      include: { variants: { orderBy: { priceMinor: 'asc' }, take: 1 }, images: { take: 1 } },
    });
    if (!store || !product) return null;
    const settings = await this.settings(storeId);

    const title = (product.metaTitle ?? settings.titleTemplate.replace('{title}', product.title).replace('{storeName}', store.name));
    const description = product.metaDescription ?? product.description ?? settings.defaultDescription ?? `${product.title} at ${store.name}`;
    const variant = product.variants[0];

    // Aggregate rating from approved reviews (if any).
    const agg = await this.prisma.review.aggregate({
      where: { storeId, productId, status: 'APPROVED' },
      _avg: { rating: true },
      _count: true,
    });

    const jsonLd: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.title,
      description,
      ...(product.images[0]?.url ? { image: product.images[0].url } : {}),
      ...(variant
        ? {
            offers: {
              '@type': 'Offer',
              price: (variant.priceMinor / 100).toFixed(2),
              priceCurrency: variant.currency,
              availability: variant.inventory > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            },
          }
        : {}),
      ...(agg._count > 0
        ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: (agg._avg.rating ?? 0).toFixed(1), reviewCount: agg._count } }
        : {}),
    };

    return { title, description, canonical: this.baseUrl(storeId), indexable: settings.indexable, jsonLd };
  }

  /** sitemap.xml covering the home page, published pages, and active products. */
  async sitemap(storeId: string): Promise<string | null> {
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { id: true, status: true } });
    if (!store || store.status !== 'ACTIVE') return null;
    const base = process.env.STOREFRONT_URL?.replace(/\/$/, '') ?? 'http://localhost:5174';
    const [products, pages] = await Promise.all([
      this.prisma.product.findMany({ where: { storeId, status: 'ACTIVE' }, select: { id: true, updatedAt: true } }),
      this.prisma.storePage.findMany({ where: { storeId, status: 'PUBLISHED' }, select: { slug: true, updatedAt: true } }),
    ]);
    const q = `?store=${storeId}`;
    const urls: { loc: string; lastmod?: Date }[] = [{ loc: `${base}/${q}` }];
    for (const pg of pages) if (pg.slug !== 'home') urls.push({ loc: `${base}/${q}#/${pg.slug}`, lastmod: pg.updatedAt });
    for (const p of products) urls.push({ loc: `${base}/product/${p.id}${q}`, lastmod: p.updatedAt });

    const body = urls
      .map((u) => `  <url>\n    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod.toISOString().slice(0, 10)}</lastmod>` : ''}\n  </url>`)
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  }

  async robots(storeId: string): Promise<string> {
    const settings = await this.settings(storeId);
    const base = process.env.STOREFRONT_URL?.replace(/\/$/, '') ?? 'http://localhost:5174';
    if (!settings.indexable) return 'User-agent: *\nDisallow: /\n';
    return `User-agent: *\nAllow: /\nSitemap: ${base}/storefront/${storeId}/sitemap.xml\n`;
  }
}
