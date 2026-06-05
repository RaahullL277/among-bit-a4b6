import type { PlatformRole } from '@prisma/client';
import { ForbiddenError } from '../context.js';

/** Permissions for platform-operator staff (cross-tenant back-office). */
export type PlatformPermission =
  | 'platform:tenants:read'
  | 'platform:tenants:write'
  | 'platform:staff:manage'
  | 'platform:audit:read';

const READ: PlatformPermission[] = ['platform:tenants:read', 'platform:audit:read'];

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, PlatformPermission[]> = {
  SUPER_ADMIN: ['platform:tenants:read', 'platform:tenants:write', 'platform:staff:manage', 'platform:audit:read'],
  SUPPORT: ['platform:tenants:read', 'platform:tenants:write', 'platform:audit:read'],
  BILLING: [...READ],
  READ_ONLY: ['platform:tenants:read'],
};

export function platformPermissionsForRole(role: PlatformRole): PlatformPermission[] {
  return PLATFORM_ROLE_PERMISSIONS[role] ?? [];
}

/** The authenticated platform staff member behind a /platform request. */
export interface PlatformContext {
  platformUserId: string;
  actorEmail: string;
  role: PlatformRole;
  permissions: PlatformPermission[];
}

export function platformHasPermission(ctx: PlatformContext | undefined, permission: PlatformPermission): boolean {
  return Boolean(ctx?.permissions.includes(permission));
}

export function requirePlatformPermission(ctx: PlatformContext, permission: PlatformPermission): void {
  if (!platformHasPermission(ctx, permission)) {
    throw new ForbiddenError(`Missing required platform permission: ${permission}`);
  }
}
