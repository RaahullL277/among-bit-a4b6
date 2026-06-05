import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { PlatformContext, PlatformPermission } from '@acp/core';

/** Routes with no platform session required (login endpoints). */
export const PLATFORM_PUBLIC_KEY = 'acp:platformPublic';
export const PlatformPublic = () => SetMetadata(PLATFORM_PUBLIC_KEY, true);

/** Platform permissions required for a route. */
export const PLATFORM_PERMS_KEY = 'acp:platformPerms';
export const PlatformPermissions = (...perms: PlatformPermission[]) =>
  SetMetadata(PLATFORM_PERMS_KEY, perms);

/** Injects the PlatformContext the guard attached to the request. */
export const Platform = createParamDecorator((_d: unknown, ctx: ExecutionContext): PlatformContext => {
  return ctx.switchToHttp().getRequest().platform as PlatformContext;
});
