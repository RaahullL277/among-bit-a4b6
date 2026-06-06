import type { PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';
import type { ProductService } from './product.service.js';
import type { ImageService } from './image.service.js';

/**
 * The built-in master prompt for the listing agent. The store owner can override
 * it (the "harness"); merge tags are filled from the store + config + the photo
 * the owner snapped. A real deployment hands this prompt to the content sub-agent
 * (Claude) — the in-house generator below is the deterministic fallback used by
 * the one-click admin flow.
 */
export const DEFAULT_MASTER_PROMPT = [
  'You are the listing agent for {{storeName}}. Turn a product photo and a few',
  'details into a complete, ready-to-sell listing.',
  'Brand voice: {{brandVoice}}. Tone: {{tone}}.',
  'Write an SEO-friendly title (≤60 chars), a ~{{descWords}}-word benefit-led',
  'description, 3–5 bullet points, a meta title, a meta description, and 5–8 tags.',
  'Keep every claim honest and India-first (prices in ₹).',
  'Rules: {{rules}}',
  'Photo: enhance per {{photoPrefs}} and write descriptive alt text.',
].join(' ');

interface ConfigShape {
  masterPrompt: string | null;
  brandVoice: string | null;
  tone: string | null;
  categoryHint: string | null;
  contentRules: string[];
  descWords: number;
  enhanceBackground: boolean;
  squareCrop: boolean;
  autoAltText: boolean;
}
const CONFIG_DEFAULTS: ConfigShape = {
  masterPrompt: null,
  brandVoice: 'friendly and trustworthy',
  tone: 'concise',
  categoryHint: null,
  contentRules: [],
  descWords: 60,
  enhanceBackground: true,
  squareCrop: true,
  autoAltText: true,
};

export interface DraftListingInput {
  storeId: string;
  imageUrl: string;
  hint?: string; // a few words about the product, e.g. "blue cotton kurta"
  category?: string;
}

export interface PublishListingInput {
  storeId: string;
  imageUrl: string;
  title: string;
  description?: string;
  metaTitle?: string;
  metaDescription?: string;
  tags?: string[];
  alt?: string;
  priceMinor: number; // what the customer pays
  discountPercent?: number; // shows a struck-through "was" price
  stock?: number;
  status?: 'DRAFT' | 'ACTIVE';
  currency?: string;
}

/**
 * Listing agent: a one-shot "snap a photo → set price/discount/stock → publish"
 * flow, orchestrating two sub-agents — a **content writer** (title, description,
 * bullets, SEO, tags) and a **photo enhancer** (background/crop/alt) — both
 * steered by the store's customisable harness (master prompt, brand voice, rules).
 */
export class ListingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly products: ProductService,
    private readonly images: ImageService,
  ) {}

  private async getStore(ctx: TenantContext, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, tenantId: ctx.tenantId }, select: { id: true, name: true, currency: true } });
    if (!store) throw new NotFoundError('Store', storeId);
    return store;
  }

  // --- Harness (config) -----------------------------------------------------

  private async resolveConfig(storeId: string): Promise<ConfigShape> {
    const row = await this.prisma.listingAgentConfig.findUnique({ where: { storeId } });
    return row
      ? {
          masterPrompt: row.masterPrompt,
          brandVoice: row.brandVoice ?? CONFIG_DEFAULTS.brandVoice,
          tone: row.tone ?? CONFIG_DEFAULTS.tone,
          categoryHint: row.categoryHint,
          contentRules: row.contentRules,
          descWords: row.descWords,
          enhanceBackground: row.enhanceBackground,
          squareCrop: row.squareCrop,
          autoAltText: row.autoAltText,
        }
      : { ...CONFIG_DEFAULTS };
  }

  /** The effective master prompt with the harness/store context filled in. */
  masterPrompt(store: { name: string }, cfg: ConfigShape, photoPrefs: string): string {
    const template = cfg.masterPrompt?.trim() || DEFAULT_MASTER_PROMPT;
    return template
      .replace(/\{\{storeName\}\}/g, store.name)
      .replace(/\{\{brandVoice\}\}/g, cfg.brandVoice ?? 'friendly')
      .replace(/\{\{tone\}\}/g, cfg.tone ?? 'concise')
      .replace(/\{\{descWords\}\}/g, String(cfg.descWords))
      .replace(/\{\{rules\}\}/g, cfg.contentRules.length ? cfg.contentRules.join('; ') : 'none')
      .replace(/\{\{photoPrefs\}\}/g, photoPrefs);
  }

  async getConfig(ctx: TenantContext, storeId: string) {
    const store = await this.getStore(ctx, storeId);
    const row = await this.prisma.listingAgentConfig.findUnique({ where: { storeId } });
    const cfg = await this.resolveConfig(storeId);
    return {
      storeId,
      isDefault: !row,
      defaultMasterPrompt: DEFAULT_MASTER_PROMPT,
      effectiveMasterPrompt: this.masterPrompt(store, cfg, this.photoPrefs(cfg)),
      ...cfg,
    };
  }

  async setConfig(ctx: TenantContext, input: { storeId: string } & Partial<ConfigShape>) {
    await this.getStore(ctx, input.storeId);
    const { storeId, ...rest } = input;
    if (rest.descWords != null && (rest.descWords < 10 || rest.descWords > 300)) {
      throw new ValidationError('descWords must be between 10 and 300.');
    }
    await this.prisma.listingAgentConfig.upsert({
      where: { storeId },
      create: { tenantId: ctx.tenantId, storeId, ...CONFIG_DEFAULTS, ...rest },
      update: rest,
    });
    return this.getConfig(ctx, storeId);
  }

  // --- Photo-enhancement sub-agent ------------------------------------------

  private photoPrefs(cfg: ConfigShape): string {
    const parts = [];
    if (cfg.enhanceBackground) parts.push('clean white background');
    if (cfg.squareCrop) parts.push('1:1 square crop');
    parts.push('auto brightness/contrast + sharpen');
    return parts.join(', ');
  }

  /** Enhance a snapped product photo (stub: returns an enhanced URL + alt +
   * the adjustments applied, per the harness). A real image model slots in here. */
  async enhancePhoto(ctx: TenantContext, input: { storeId: string; imageUrl: string; hint?: string }) {
    await this.getStore(ctx, input.storeId);
    if (!input.imageUrl?.trim()) throw new ValidationError('An image URL is required.');
    const cfg = await this.resolveConfig(input.storeId);
    const adjustments: string[] = ['auto brightness', 'contrast boost', 'sharpen'];
    if (cfg.enhanceBackground) adjustments.unshift('background cleanup');
    if (cfg.squareCrop) adjustments.push('1:1 crop');
    const sep = input.imageUrl.includes('?') ? '&' : '?';
    const params = ['enhanced=1'];
    if (cfg.enhanceBackground) params.push('bg=clean');
    if (cfg.squareCrop) params.push('crop=square');
    const enhancedUrl = `${input.imageUrl.trim()}${sep}${params.join('&')}`;
    const alt = cfg.autoAltText ? this.altText(input.hint, cfg) : undefined;
    return { originalUrl: input.imageUrl.trim(), enhancedUrl, alt, adjustments };
  }

  private altText(hint: string | undefined, cfg: ConfigShape): string {
    const subject = (hint?.trim() || cfg.categoryHint || 'product').toLowerCase();
    return `${this.titleCase(subject)} on a clean background`;
  }

  // --- Content-writing sub-agent --------------------------------------------

  /** Generate listing copy from a short hint + price (stub: heuristic generator
   * that honours brand voice / tone / rules). A real LLM slots in behind this. */
  async writeContent(
    ctx: TenantContext,
    input: { storeId: string; hint?: string; priceMinor?: number; alt?: string },
  ) {
    const store = await this.getStore(ctx, input.storeId);
    const cfg = await this.resolveConfig(input.storeId);
    const subject = (input.hint?.trim() || cfg.categoryHint || 'New product').trim();
    const title = this.composeTitle(subject, cfg);
    const description = this.composeDescription(subject, cfg, input.priceMinor, store.currency);
    const bullets = this.composeBullets(subject, cfg);
    const tags = this.composeTags(subject, cfg);
    const seoTitle = `${title} — ${store.name}`.slice(0, 60);
    const seoDescription = `Shop ${subject.toLowerCase()} at ${store.name}. ${this.toneWord(cfg)} quality, fast delivery across India.`.slice(0, 160);
    return { title, description, bullets, tags, seoTitle, seoDescription };
  }

  private toneAdjectives(cfg: ConfigShape): string[] {
    const v = `${cfg.brandVoice ?? ''} ${cfg.tone ?? ''}`.toLowerCase();
    if (v.includes('premium') || v.includes('luxur')) return ['premium', 'beautifully crafted', 'refined'];
    if (v.includes('playful') || v.includes('witty') || v.includes('fun')) return ['fun', 'eye-catching', 'easy to love'];
    if (v.includes('minimal')) return ['clean', 'understated', 'versatile'];
    return ['high-quality', 'dependable', 'well-made'];
  }
  private toneWord(cfg: ConfigShape): string {
    return this.toneAdjectives(cfg)[0].replace(/^./, (c) => c.toUpperCase());
  }

  private composeTitle(subject: string, cfg: ConfigShape): string {
    const adj = this.toneAdjectives(cfg)[0];
    const t = `${this.titleCase(adj)} ${this.titleCase(subject)}`;
    return t.length <= 60 ? t : this.titleCase(subject).slice(0, 60);
  }

  private composeDescription(subject: string, cfg: ConfigShape, priceMinor: number | undefined, currency: string): string {
    const [a1, a2] = this.toneAdjectives(cfg);
    const s = subject.toLowerCase();
    const price = priceMinor != null ? ` At ${this.money(priceMinor, currency)}, it’s a smart buy.` : '';
    const ruleLine = cfg.contentRules.length ? ` ${cfg.contentRules[0]}.` : '';
    const base = `Meet our ${a1} ${s} — ${a2} and made to last. Designed for everyday use, it brings together quality materials and a thoughtful finish.${price}${ruleLine} Free, easy returns and quick delivery across India.`;
    // Trim toward the target word count.
    const words = base.split(/\s+/);
    return words.length > cfg.descWords + 12 ? words.slice(0, cfg.descWords + 6).join(' ') + '…' : base;
  }

  private composeBullets(subject: string, cfg: ConfigShape): string[] {
    const [a1, a2] = this.toneAdjectives(cfg);
    return [
      `${this.titleCase(a1)} ${subject.toLowerCase()}`,
      `${this.titleCase(a2)} build, made to last`,
      'Fast delivery across India',
      'Easy, hassle-free returns',
    ];
  }

  private composeTags(subject: string, cfg: ConfigShape): string[] {
    const words = subject.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const tags = new Set<string>(words);
    if (cfg.categoryHint) tags.add(cfg.categoryHint.toLowerCase());
    tags.add('new arrival');
    this.toneAdjectives(cfg).slice(0, 1).forEach((a) => tags.add(a));
    return [...tags].slice(0, 8);
  }

  // --- Draft + publish (the one-click flow) ---------------------------------

  /** Run both sub-agents and return a ready-to-edit draft listing. */
  async draft(ctx: TenantContext, input: DraftListingInput) {
    const store = await this.getStore(ctx, input.storeId);
    const cfg = await this.resolveConfig(input.storeId);
    const photo = await this.enhancePhoto(ctx, { storeId: input.storeId, imageUrl: input.imageUrl, hint: input.hint });
    const content = await this.writeContent(ctx, { storeId: input.storeId, hint: input.hint, alt: photo.alt });
    return {
      storeId: input.storeId,
      masterPrompt: this.masterPrompt(store, cfg, this.photoPrefs(cfg)),
      photo,
      content,
      // Everything pre-filled; the owner just sets price / discount / stock.
      suggested: { status: 'ACTIVE', stock: 10 },
    };
  }

  /** Publish the (possibly edited) listing as a real product with an image. */
  async publish(ctx: TenantContext, input: PublishListingInput) {
    const store = await this.getStore(ctx, input.storeId);
    if (!input.title?.trim()) throw new ValidationError('A title is required to publish.');
    if (input.priceMinor == null || input.priceMinor < 0) throw new ValidationError('A valid price is required.');
    const d = input.discountPercent ?? 0;
    if (d < 0 || d >= 100) throw new ValidationError('discountPercent must be between 0 and 99.');
    const priceMinor = Math.round(input.priceMinor); // what the customer pays
    const compareAtMinor = d > 0 ? Math.round(priceMinor / (1 - d / 100)) : undefined; // struck-through "was"

    const product = await this.products.create(ctx, {
      storeId: input.storeId,
      title: input.title.trim(),
      description: input.description,
      status: input.status ?? 'ACTIVE',
      tags: input.tags ?? [],
      metaTitle: input.metaTitle,
      metaDescription: input.metaDescription,
      variants: [{ priceMinor, compareAtMinor, currency: input.currency ?? store.currency, inventory: Math.max(0, Math.round(input.stock ?? 0)) }],
    });

    // Attach + "optimise" the enhanced photo.
    let imageId: string | undefined;
    if (input.imageUrl?.trim()) {
      const img = await this.images.create(ctx, { storeId: input.storeId, productId: product.id, url: input.imageUrl.trim(), alt: input.alt, originalBytes: 800_000 });
      await this.images.optimize(ctx, img.id).catch(() => undefined);
      imageId = img.id;
    }

    return {
      product: { id: product.id, title: product.title, status: product.status },
      variantId: product.variants[0]?.id,
      priceMinor,
      compareAtMinor: compareAtMinor ?? null,
      discountPercent: d || null,
      imageId,
      storefrontUrl: `${store.id}`,
    };
  }

  // --- Helpers --------------------------------------------------------------

  private titleCase(s: string): string {
    return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
  }
  private money(minor: number, currency: string): string {
    try {
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100);
    } catch {
      return `${currency} ${(minor / 100).toFixed(0)}`;
    }
  }
}
