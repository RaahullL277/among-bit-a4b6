import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getCommerce } from '@acp/core';
import { IS_PUBLIC_KEY } from '../common/public.decorator.js';

/**
 * Authenticates every request with an API key (header `x-api-key` or
 * `Authorization: Bearer <key>`), resolving it into a TenantContext that is
 * attached to the request. The same key model authenticates the MCP server.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  // Instantiated directly (Reflector is a thin wrapper over reflect-metadata)
  // so the guard needs no constructor-based DI.
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

    // Throws AuthError -> mapped to 401 by CoreExceptionFilter.
    req.tenant = await getCommerce().apiKeys.verify(raw);
    return true;
  }
}
