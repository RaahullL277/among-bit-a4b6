import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getCommerce } from '@acp/core';
import { PARTNER_PUBLIC_KEY } from '../common/partner.decorator.js';

/**
 * Authenticates partners via a partner session token (`pts_`) on /partner
 * routes (which are @Public() so the tenant guard skips them) — a separate
 * identity plane scoped to the partner's own clients. @PartnerPublic() exempts
 * the login endpoints.
 */
@Injectable()
export class PartnerAuthGuard implements CanActivate {
  private readonly reflector = new Reflector();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PARTNER_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const header = req.headers['authorization'];
    const raw = typeof header === 'string' ? header.replace(/^Bearer\s+/i, '') : undefined;
    // Throws AuthError → 401 if missing/expired.
    req.partner = await getCommerce().partnerAuth.resolveSession(raw ?? '');
    return true;
  }
}
