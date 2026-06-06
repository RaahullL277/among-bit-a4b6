import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { getCommerce, type TenantContext } from '@acp/core';
import { tap } from 'rxjs';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Records every successful mutating request made under a tenant context (admin
 * owner/staff, API key, or a partner acting on a client store) to the merchant
 * audit trail. Reads and public/unauthenticated routes are skipped. Writes are
 * best-effort and never block the response.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly commerce = getCommerce();

  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();
    const method: string = req.method;
    const tenant = req.tenant as TenantContext | undefined;

    // Only audit tenant-scoped mutations (req.tenant is set by the auth guard).
    if (!MUTATING.has(method) || !tenant?.tenantId || !tenant.actor) {
      return next.handle();
    }

    const res = context.switchToHttp().getResponse();
    const routePath: string = req.route?.path ?? req.path ?? req.url ?? '';
    const resource = routePath.split('/').filter(Boolean)[0] ?? undefined;
    const resourceId: string | undefined = req.params?.id ?? req.body?.storeId ?? undefined;
    const actor = tenant.actor as any;
    const actorId: string | undefined = actor.userId ?? actor.partnerId ?? undefined;

    return next.handle().pipe(
      tap(() => {
        void this.commerce.audit.record({
          tenantId: tenant.tenantId,
          actorKind: actor.kind,
          actorId,
          action: `${resource ?? 'request'}.${verb(method)}`,
          method,
          path: routePath,
          resource,
          resourceId,
          statusCode: res.statusCode ?? 200,
          metadata: req.params && Object.keys(req.params).length ? { params: req.params } : undefined,
        });
      }),
    );
  }
}

function verb(method: string): string {
  switch (method) {
    case 'POST': return 'create';
    case 'PUT': return 'set';
    case 'PATCH': return 'update';
    case 'DELETE': return 'delete';
    default: return method.toLowerCase();
  }
}
