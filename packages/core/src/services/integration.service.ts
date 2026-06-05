import type { PrismaClient, ProviderName } from '@prisma/client';
import { decryptJson, encryptJson, type EncryptedBlob } from '../crypto.js';
import { NotFoundError, type TenantContext } from '../context.js';
import { PROVIDER_KIND } from '../adapters/registry.js';
import type { ProviderCredentials } from '../adapters/payment.js';

/**
 * Stores per-store provider configuration. Credentials are encrypted at rest;
 * only `getCredentials` decrypts them, and only for internal adapter resolution.
 */
export class IntegrationService {
  constructor(private readonly prisma: PrismaClient) {}

  private async assertStore(ctx: TenantContext, storeId: string) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!store) throw new NotFoundError('Store', storeId);
  }

  async configure(
    ctx: TenantContext,
    input: { storeId: string; provider: ProviderName; credentials: ProviderCredentials; enabled?: boolean },
  ) {
    await this.assertStore(ctx, input.storeId);
    const kind = PROVIDER_KIND[input.provider];
    const encrypted = encryptJson(input.credentials);

    const config = await this.prisma.integrationConfig.upsert({
      where: { storeId_provider: { storeId: input.storeId, provider: input.provider } },
      create: {
        tenantId: ctx.tenantId,
        storeId: input.storeId,
        kind,
        provider: input.provider,
        config: encrypted as unknown as object,
        enabled: input.enabled ?? true,
      },
      update: {
        config: encrypted as unknown as object,
        enabled: input.enabled ?? true,
      },
    });

    // Never return decrypted credentials to callers.
    return { id: config.id, storeId: config.storeId, provider: config.provider, kind: config.kind, enabled: config.enabled };
  }

  async list(ctx: TenantContext, storeId: string) {
    await this.assertStore(ctx, storeId);
    const rows = await this.prisma.integrationConfig.findMany({
      where: { tenantId: ctx.tenantId, storeId },
    });
    return rows.map((r) => ({ id: r.id, provider: r.provider, kind: r.kind, enabled: r.enabled }));
  }

  /** Internal: resolve decrypted credentials for adapter construction. */
  async getCredentials(
    ctx: TenantContext,
    storeId: string,
    provider: ProviderName,
  ): Promise<ProviderCredentials> {
    const config = await this.prisma.integrationConfig.findFirst({
      where: { tenantId: ctx.tenantId, storeId, provider, enabled: true },
    });
    if (!config) throw new NotFoundError(`Enabled ${provider} integration`, storeId);
    return decryptJson<ProviderCredentials>(config.config as unknown as EncryptedBlob);
  }

  /** Internal: pick the active payment provider configured for a store. */
  async getActivePaymentProvider(ctx: TenantContext, storeId: string): Promise<ProviderName> {
    const config = await this.prisma.integrationConfig.findFirst({
      where: { tenantId: ctx.tenantId, storeId, kind: 'PAYMENT', enabled: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!config) throw new NotFoundError('Enabled payment integration for store', storeId);
    return config.provider;
  }
}
