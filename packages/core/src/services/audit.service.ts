import type { PrismaClient } from '@prisma/client';
import type { TenantContext } from '../context.js';

export interface AuditEntry {
  tenantId: string;
  actorKind: string; // user | apiKey | partner
  actorId?: string | null;
  action: string;
  method: string;
  path: string;
  resource?: string | null;
  resourceId?: string | null;
  statusCode: number;
  metadata?: Record<string, unknown> | null;
}

/**
 * Merchant-side audit trail. Records who changed what within a tenant — owner,
 * staff, API key, or a partner acting under delegated access. Writes are
 * best-effort (never block or fail the underlying request); reads are tenant-scoped.
 */
export class AuditService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Best-effort write (fire-and-forget at call sites). */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: entry.tenantId,
          actorKind: entry.actorKind,
          actorId: entry.actorId ?? null,
          action: entry.action,
          method: entry.method,
          path: entry.path,
          resource: entry.resource ?? null,
          resourceId: entry.resourceId ?? null,
          statusCode: entry.statusCode,
          metadata: (entry.metadata ?? undefined) as object | undefined,
        },
      });
    } catch {
      // Auditing must never break the request it describes.
    }
  }

  async list(
    ctx: TenantContext,
    opts: { limit?: number; action?: string; actorKind?: string; resource?: string } = {},
  ) {
    return this.prisma.auditLog.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(opts.action ? { action: opts.action } : {}),
        ...(opts.actorKind ? { actorKind: opts.actorKind } : {}),
        ...(opts.resource ? { resource: opts.resource } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(opts.limit ?? 100, 500),
    });
  }
}
