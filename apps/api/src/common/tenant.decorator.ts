import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { TenantContext } from '@acp/core';

/** Injects the TenantContext that ApiKeyGuard attached to the request. */
export const Tenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const req = ctx.switchToHttp().getRequest();
    return req.tenant as TenantContext;
  },
);
