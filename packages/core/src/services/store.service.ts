import type { PrismaClient, Store } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';
import { effectivePlan } from '../platform/plans.js';
import { isLikelyGstin, resolveStateCode, stateCodeFromGstin } from '../tax/india-states.js';

export interface CreateStoreInput {
  name: string;
  slug?: string;
  domain?: string;
  currency?: string;
  country?: string;
  ownerEmail?: string;
  ownerPhone?: string;
}

export interface UpdateStoreInput {
  name?: string;
  domain?: string;
  status?: 'ACTIVE' | 'SUSPENDED';
  ownerEmail?: string;
  ownerPhone?: string;
}

/** Seller tax identity printed on GST invoices (item 1). */
export interface StoreTaxIdentityInput {
  legalName?: string | null;
  gstin?: string | null;
  pan?: string | null;
  taxAddressLine1?: string | null;
  taxAddressLine2?: string | null;
  taxCity?: string | null;
  taxState?: string | null;
  taxStateCode?: string | null;
  taxPincode?: string | null;
  invoicePrefix?: string;
  creditNotePrefix?: string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export class StoreService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(ctx: TenantContext, input: CreateStoreInput): Promise<Store> {
    const slug = slugify(input.slug ?? input.name);
    if (!slug) throw new ValidationError('A store name or slug is required.');

    const existing = await this.prisma.store.findUnique({
      where: { tenantId_slug: { tenantId: ctx.tenantId, slug } },
    });
    if (existing) throw new ValidationError(`A store with slug "${slug}" already exists.`);

    // Enforce the store limit only for tenants with an explicitly assigned plan
    // (tenants without a plan row are unlimited).
    const planRow = await this.prisma.tenantPlan.findUnique({ where: { tenantId: ctx.tenantId } });
    if (planRow) {
      const plan = effectivePlan(planRow);
      if (plan.storeLimit != null) {
        const count = await this.prisma.store.count({ where: { tenantId: ctx.tenantId } });
        if (count >= plan.storeLimit) {
          throw new ValidationError(
            `Your ${plan.tier} plan allows up to ${plan.storeLimit} store(s). Upgrade to add more.`,
          );
        }
      }
    }

    return this.prisma.store.create({
      data: {
        tenantId: ctx.tenantId,
        name: input.name,
        slug,
        domain: input.domain,
        currency: input.currency ?? 'INR',
        country: input.country ?? 'IN',
        ownerEmail: input.ownerEmail,
        ownerPhone: input.ownerPhone,
      },
    });
  }

  async list(ctx: TenantContext): Promise<Store[]> {
    return this.prisma.store.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(ctx: TenantContext, id: string): Promise<Store> {
    const store = await this.prisma.store.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!store) throw new NotFoundError('Store', id);
    return store;
  }

  async update(ctx: TenantContext, id: string, input: UpdateStoreInput): Promise<Store> {
    await this.get(ctx, id); // tenant-scoped existence check
    return this.prisma.store.update({
      where: { id },
      data: {
        name: input.name,
        domain: input.domain,
        status: input.status,
        ownerEmail: input.ownerEmail,
        ownerPhone: input.ownerPhone,
      },
    });
  }

  /** Read the seller tax identity (for the invoice settings UI). */
  async getTaxIdentity(ctx: TenantContext, id: string) {
    const store = await this.get(ctx, id);
    return {
      storeId: store.id,
      name: store.name,
      legalName: store.legalName,
      gstin: store.gstin,
      pan: store.pan,
      taxAddressLine1: store.taxAddressLine1,
      taxAddressLine2: store.taxAddressLine2,
      taxCity: store.taxCity,
      taxState: store.taxState,
      taxStateCode: store.taxStateCode,
      taxPincode: store.taxPincode,
      invoicePrefix: store.invoicePrefix,
      creditNotePrefix: store.creditNotePrefix,
    };
  }

  /** Set the seller tax identity (GSTIN, legal name, registered address, series). */
  async setTaxIdentity(ctx: TenantContext, id: string, input: StoreTaxIdentityInput): Promise<Store> {
    await this.get(ctx, id);
    const gstin = input.gstin?.trim().toUpperCase() || null;
    if (gstin && !isLikelyGstin(gstin)) {
      throw new ValidationError('GSTIN must be a valid 15-character GST identification number.');
    }
    // Derive the state code from the GSTIN if not given explicitly, else the state name.
    const taxStateCode =
      input.taxStateCode?.trim() ||
      stateCodeFromGstin(gstin) ||
      (input.taxState ? resolveStateCode(input.taxState) : undefined) ||
      undefined;
    return this.prisma.store.update({
      where: { id },
      data: {
        legalName: input.legalName,
        gstin,
        pan: input.pan?.trim().toUpperCase() || (input.pan === null ? null : undefined),
        taxAddressLine1: input.taxAddressLine1,
        taxAddressLine2: input.taxAddressLine2,
        taxCity: input.taxCity,
        taxState: input.taxState,
        taxStateCode,
        taxPincode: input.taxPincode,
        invoicePrefix: input.invoicePrefix?.trim() || undefined,
        creditNotePrefix: input.creditNotePrefix?.trim() || undefined,
      },
    });
  }
}
