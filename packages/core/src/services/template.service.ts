import type { PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';
import type { PageService } from './page.service.js';
import { STORE_TEMPLATES, type StoreCategory, type StoreTemplate } from '../templates/store-templates.js';

/**
 * Store design templates: ready-made theme + storefront home-page layouts,
 * tailored per vertical (fashion / lifestyle / cosmetics / jewellery /
 * kitchenware / perfumes — the last two segmented by shopper type). Applying a
 * template sets the store theme and publishes a `home` page from the template's
 * sections — the merchant's own products fill the product grid.
 */
export class TemplateService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly pages: PageService,
  ) {}

  /** List templates (optionally for one category). Design-only; no DB needed. */
  list(category?: StoreCategory): Array<Omit<StoreTemplate, 'sections'> & { sections: number }> {
    const items = category ? STORE_TEMPLATES.filter((t) => t.category === category) : STORE_TEMPLATES;
    // Return metadata + a preview-friendly shape (omit the full section payload).
    return items.map(({ sections, ...t }) => ({ ...t, sections: sections.length }));
  }

  get(id: string): StoreTemplate {
    const t = STORE_TEMPLATES.find((x) => x.id === id);
    if (!t) throw new NotFoundError('StoreTemplate', id);
    return t;
  }

  /** Apply a template to a store: set the theme + publish the home page. */
  async apply(ctx: TenantContext, storeId: string, templateId: string, opts: { publish?: boolean } = {}) {
    const template = this.get(templateId);
    const store = await this.prisma.store.findFirst({ where: { id: storeId, tenantId: ctx.tenantId }, select: { id: true, name: true } });
    if (!store) throw new NotFoundError('Store', storeId);

    await this.pages.setTheme(ctx, {
      storeId,
      primaryColor: template.theme.primaryColor,
      accentColor: template.theme.accentColor,
      logoText: store.name,
    });

    const status = opts.publish === false ? 'DRAFT' : 'PUBLISHED';
    // Personalize the hero heading's fallback subheading with the store name.
    const sections = template.sections.map((s) =>
      s.type === 'hero' ? { ...s, data: { ...s.data, subheading: s.data.subheading || template.tagline } } : s,
    );

    const existing = (await this.pages.list(ctx, storeId)).find((p) => p.slug === 'home');
    const page = existing
      ? await this.pages.update(ctx, existing.id, { storeId, title: store.name, sections, status })
      : await this.pages.create(ctx, { storeId, slug: 'home', title: store.name, sections, status });

    const base = (process.env.STOREFRONT_URL ?? 'http://localhost:5174').replace(/\/$/, '');
    return {
      storeId,
      template: { id: template.id, name: template.name, category: template.category },
      theme: template.theme,
      published: page.status === 'PUBLISHED',
      storefrontUrl: `${base}/?store=${storeId}`,
    };
  }

  /** Resolve a template's theme + sections for the launch flow (no DB writes). */
  resolveForLaunch(templateId: string) {
    const t = this.get(templateId);
    if (!t) throw new ValidationError(`Unknown template "${templateId}".`);
    return { theme: t.theme, tagline: t.tagline, sections: t.sections };
  }
}
