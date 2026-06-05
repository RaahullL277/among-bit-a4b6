import type { PrismaClient } from '@prisma/client';
import { generateApiKey, hashApiKey } from '../crypto.js';
import { AuthError, type TenantContext } from '../context.js';
import { ALL_PERMISSIONS } from '../authz.js';

export interface CreatedApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  /** Full secret — returned only at creation time, never again. */
  raw: string;
}

/**
 * API keys authenticate both the REST API and the MCP server. `verify` is the
 * only method that runs without an existing TenantContext — it produces one.
 */
export class ApiKeyService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Resolve a raw key into a TenantContext, or throw AuthError. */
  async verify(rawKey: string | undefined): Promise<TenantContext> {
    if (!rawKey) throw new AuthError();
    const key = await this.prisma.apiKey.findUnique({
      where: { keyHash: hashApiKey(rawKey) },
      include: { tenant: { select: { status: true } } },
    });
    if (!key || key.revokedAt) throw new AuthError();
    if (key.tenant.status === 'SUSPENDED') throw new AuthError('This workspace has been suspended.');

    // Best-effort last-used tracking; never blocks auth.
    void this.prisma.apiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    // API keys are trusted programmatic/agent access → all permissions.
    return {
      tenantId: key.tenantId,
      scopes: key.scopes,
      actor: { kind: 'apiKey', permissions: ALL_PERMISSIONS },
    };
  }

  async create(
    ctx: TenantContext,
    input: { name: string; scopes?: string[] },
  ): Promise<CreatedApiKey> {
    const generated = generateApiKey();
    const key = await this.prisma.apiKey.create({
      data: {
        tenantId: ctx.tenantId,
        name: input.name,
        keyHash: generated.keyHash,
        prefix: generated.prefix,
        scopes: input.scopes ?? [],
      },
    });
    return {
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      scopes: key.scopes,
      raw: generated.raw,
    };
  }

  async list(ctx: TenantContext) {
    return this.prisma.apiKey.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true, prefix: true, scopes: true, lastUsedAt: true, createdAt: true, revokedAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(ctx: TenantContext, id: string) {
    await this.prisma.apiKey.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data: { revokedAt: new Date() },
    });
  }
}
