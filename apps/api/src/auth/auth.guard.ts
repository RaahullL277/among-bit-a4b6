import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenError, getCommerce, type Permission } from '@acp/core';
import { IS_PUBLIC_KEY } from '../common/public.decorator.js';
import { PERMISSIONS_KEY } from '../common/permissions.decorator.js';

/**
 * Authenticates every request, then authorizes it against any @Permissions on
 * the route. A credential may be either:
 *   - an API key (`sk_...`)        → trusted actor with all permissions
 *   - a session token (`ses_...`)  → user actor with their role's permissions
 * resolved into the TenantContext attached as `req.tenant`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly reflector = new Reflector();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const header = req.headers['x-api-key'] ?? req.headers['authorization'];
    const raw = typeof header === 'string' ? header.replace(/^Bearer\s+/i, '') : undefined;

    const commerce = getCommerce();
    let ctx;
    if (raw?.startsWith('pts_')) {
      // A partner acting on a client store. The target client tenant is named by
      // the `x-acp-client` header; the granted permissions are governed by the
      // client's access level (MANAGE → full, VIEW → read-only, NONE → denied).
      const clientTenant = req.headers['x-acp-client'];
      if (typeof clientTenant !== 'string' || !clientTenant) {
        throw new ForbiddenError('Partner requests must specify an x-acp-client tenant.');
      }
      const partner = await commerce.partnerAuth.resolveSession(raw);
      ctx = await commerce.partners.resolveDelegatedContext(partner.partnerId, clientTenant);
    } else if (raw && !raw.startsWith('sk_')) {
      ctx = await commerce.auth.resolveSession(raw); // user session (`ses_`)
    } else {
      ctx = await commerce.apiKeys.verify(raw); // API key (`sk_`)
    }
    req.tenant = ctx;

    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required?.length) {
      const held = new Set(ctx.actor?.permissions ?? []);
      const missing = required.find((p) => !held.has(p));
      if (missing) throw new ForbiddenError(`Missing required permission: ${missing}`);
    }
    return true;
  }
}
