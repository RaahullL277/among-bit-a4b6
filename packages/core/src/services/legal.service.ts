import type { LegalPolicyType, PageStatus, PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';
import { type LegalContext, legalTitle, renderLegalTemplate } from '../legal/templates.js';

const ALL_TYPES: LegalPolicyType[] = ['TERMS', 'PRIVACY', 'SHIPPING', 'REFUND', 'COOKIES'];

export interface SetLegalInput {
  storeId: string;
  type: LegalPolicyType;
  title?: string;
  body?: string;
  status?: PageStatus;
}

/**
 * Store legal/policy documents (Terms, Privacy, Shipping, Refund, Cookies).
 * Generates India/GST-aware defaults from the seller identity + return policy,
 * lets the merchant edit them, publishes them, and exposes the published set to
 * the storefront (footer + checkout). Same service backs REST, MCP and the admin.
 */
export class LegalService {
  constructor(private readonly prisma: PrismaClient) {}

  private async assertStore(ctx: TenantContext, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!store) throw new NotFoundError('Store', storeId);
  }

  // --- Template context -----------------------------------------------------

  /** Gather everything the templates need from the store + its return policy. */
  private async buildContext(storeId: string): Promise<LegalContext> {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundError('Store', storeId);
    const policy = await this.prisma.returnPolicy.findUnique({ where: { storeId } });
    const addr = [store.taxAddressLine1, store.taxAddressLine2, store.taxCity, store.taxState, store.taxPincode]
      .filter(Boolean)
      .join(', ');
    return {
      storeName: store.name,
      legalName: store.legalName,
      gstin: store.gstin,
      address: addr || null,
      supportEmail: store.ownerEmail,
      supportPhone: store.ownerPhone,
      website: store.domain,
      country: store.country,
      returnWindowDays: policy?.returnWindowDays ?? 30,
      restockingFeePercent: policy?.restockingFeePercent ?? 0,
      cancelWindowHours: policy?.cancelWindowHours ?? 24,
    };
  }

  // --- Merchant / agent CRUD ------------------------------------------------

  async list(ctx: TenantContext, storeId: string) {
    await this.assertStore(ctx, storeId);
    return this.prisma.legalPolicy.findMany({ where: { tenantId: ctx.tenantId, storeId }, orderBy: { type: 'asc' } });
  }

  async get(ctx: TenantContext, storeId: string, type: LegalPolicyType) {
    await this.assertStore(ctx, storeId);
    const row = await this.prisma.legalPolicy.findUnique({ where: { storeId_type: { storeId, type } } });
    if (!row) throw new NotFoundError('LegalPolicy', `${storeId}/${type}`);
    return row;
  }

  /** Create/update one policy with merchant-supplied content. */
  async set(ctx: TenantContext, input: SetLegalInput) {
    await this.assertStore(ctx, input.storeId);
    if (!ALL_TYPES.includes(input.type)) throw new ValidationError(`Unknown policy type "${input.type}".`);
    const existing = await this.prisma.legalPolicy.findUnique({ where: { storeId_type: { storeId: input.storeId, type: input.type } } });
    const body = input.body ?? existing?.body;
    if (!body?.trim()) throw new ValidationError('A policy body is required.');
    const title = input.title?.trim() || existing?.title || legalTitle(input.type);
    const status = input.status ?? existing?.status ?? 'DRAFT';
    // Bump the version when the body actually changes (for acceptance tracking).
    const bodyChanged = !existing || existing.body !== body;
    const publishedAt = status === 'PUBLISHED' ? existing?.publishedAt ?? new Date() : existing?.publishedAt ?? null;

    return this.prisma.legalPolicy.upsert({
      where: { storeId_type: { storeId: input.storeId, type: input.type } },
      create: {
        tenantId: ctx.tenantId,
        storeId: input.storeId,
        type: input.type,
        title,
        body,
        status,
        generated: false,
        publishedAt: status === 'PUBLISHED' ? new Date() : null,
      },
      update: {
        title,
        body,
        status,
        generated: false,
        version: bodyChanged ? (existing?.version ?? 1) + 1 : existing?.version ?? 1,
        publishedAt,
      },
    });
  }

  /** Publish or unpublish a policy. */
  async setStatus(ctx: TenantContext, storeId: string, type: LegalPolicyType, status: PageStatus) {
    const row = await this.get(ctx, storeId, type);
    return this.prisma.legalPolicy.update({
      where: { id: row.id },
      data: { status, publishedAt: status === 'PUBLISHED' ? row.publishedAt ?? new Date() : row.publishedAt },
    });
  }

  /** Generate one policy from the India/GST-aware template. Optionally publish it. */
  async generate(ctx: TenantContext, storeId: string, type: LegalPolicyType, opts: { publish?: boolean } = {}) {
    await this.assertStore(ctx, storeId);
    if (!ALL_TYPES.includes(type)) throw new ValidationError(`Unknown policy type "${type}".`);
    const c = await this.buildContext(storeId);
    const { title, body } = renderLegalTemplate(type, c);
    const existing = await this.prisma.legalPolicy.findUnique({ where: { storeId_type: { storeId, type } } });
    const status: PageStatus = opts.publish ? 'PUBLISHED' : existing?.status ?? 'DRAFT';
    const bodyChanged = !existing || existing.body !== body;
    return this.prisma.legalPolicy.upsert({
      where: { storeId_type: { storeId, type } },
      create: {
        tenantId: ctx.tenantId,
        storeId,
        type,
        title,
        body,
        status,
        generated: true,
        publishedAt: status === 'PUBLISHED' ? new Date() : null,
      },
      update: {
        title,
        body,
        generated: true,
        status,
        version: bodyChanged ? (existing?.version ?? 1) + 1 : existing?.version ?? 1,
        publishedAt: status === 'PUBLISHED' ? existing?.publishedAt ?? new Date() : existing?.publishedAt ?? null,
      },
    });
  }

  /** Generate (and optionally publish) all five policies in one call. */
  async generateAll(ctx: TenantContext, storeId: string, opts: { publish?: boolean } = {}) {
    await this.assertStore(ctx, storeId);
    const out = [];
    for (const type of ALL_TYPES) {
      out.push(await this.generate(ctx, storeId, type, opts));
    }
    return out;
  }

  // --- Buyer acceptance (checkout consent trail) ----------------------------

  /**
   * Record that a buyer accepted the store's published policies (snapshotting
   * which versions were in force). Best-effort context: orderId/email/ip.
   */
  async recordAcceptance(storeId: string, opts: { orderId?: string; email?: string; ip?: string; tenantId?: string } = {}) {
    const published = await this.prisma.legalPolicy.findMany({
      where: { storeId, status: 'PUBLISHED' },
      select: { type: true, version: true, tenantId: true },
    });
    if (!published.length) return null; // nothing published to accept
    const tenantId = opts.tenantId ?? published[0].tenantId;
    return this.prisma.legalAcceptance.create({
      data: {
        tenantId,
        storeId,
        orderId: opts.orderId,
        email: opts.email,
        ip: opts.ip,
        policies: published.map((p) => ({ type: p.type, version: p.version })) as unknown as object,
      },
    });
  }

  /** Merchant audit: recent buyer acceptances for a store. */
  async listAcceptances(ctx: TenantContext, storeId: string, limit = 200) {
    await this.assertStore(ctx, storeId);
    return this.prisma.legalAcceptance.findMany({
      where: { tenantId: ctx.tenantId, storeId },
      orderBy: { acceptedAt: 'desc' },
      take: Math.min(limit, 1000),
    });
  }

  // --- Public (storefront) --------------------------------------------------

  /** Published policies for the storefront footer (title + type + slug). */
  async publicList(storeId: string) {
    const rows = await this.prisma.legalPolicy.findMany({
      where: { storeId, status: 'PUBLISHED' },
      select: { type: true, title: true, updatedAt: true },
      orderBy: { type: 'asc' },
    });
    return rows.map((r) => ({ type: r.type, title: r.title, slug: r.type.toLowerCase(), updatedAt: r.updatedAt }));
  }

  /** A single published policy for the storefront (by type or its lowercase slug). */
  async publicGet(storeId: string, type: string) {
    const upper = String(type).toUpperCase();
    if (!ALL_TYPES.includes(upper as LegalPolicyType)) return null;
    const row = await this.prisma.legalPolicy.findFirst({
      where: { storeId, type: upper as LegalPolicyType, status: 'PUBLISHED' },
      select: { type: true, title: true, body: true, version: true, updatedAt: true },
    });
    return row;
  }
}
