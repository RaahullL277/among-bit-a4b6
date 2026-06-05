import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenError, getCommerce, type PlatformPermission } from '@acp/core';
import { PLATFORM_PERMS_KEY, PLATFORM_PUBLIC_KEY } from '../common/platform.decorator.js';

/**
 * Authenticates platform-operator staff via a platform session token (`psa_`)
 * and authorizes against the route's @PlatformPermissions. Runs on /platform
 * routes (which are @Public() so the tenant guard skips them) — this is the
 * separate operator auth plane, with no tenant context.
 */
@Injectable()
export class PlatformAuthGuard implements CanActivate {
  private readonly reflector = new Reflector();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PLATFORM_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const header = req.headers['authorization'];
    const raw = typeof header === 'string' ? header.replace(/^Bearer\s+/i, '') : undefined;

    // Throws AuthError → 401 if missing/expired.
    req.platform = await getCommerce().platformAuth.resolveSession(raw ?? '');

    const required = this.reflector.getAllAndOverride<PlatformPermission[]>(PLATFORM_PERMS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required?.length) {
      const held = new Set(req.platform.permissions);
      const missing = required.find((p) => !held.has(p));
      if (missing) throw new ForbiddenError(`Missing required platform permission: ${missing}`);
    }
    return true;
  }
}
