import type { Role } from '@prisma/client';
import { ForbiddenError, type TenantContext } from './context.js';

/**
 * Coarse-grained permissions. Each maps to one or more product capabilities;
 * roles are defined as permission sets below. API keys are granted all
 * permissions (trusted programmatic/agent access).
 */
export type Permission =
  | 'stores:read'
  | 'stores:write'
  | 'products:read'
  | 'products:write'
  | 'orders:read'
  | 'orders:write'
  | 'customers:read'
  | 'customers:write'
  | 'integrations:write'
  | 'notifications:write'
  | 'members:manage'
  | 'apikeys:manage';

const READS: Permission[] = ['stores:read', 'products:read', 'orders:read', 'customers:read'];
const WRITES: Permission[] = ['products:write', 'orders:write', 'customers:write'];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  // Full control of the tenant.
  OWNER: [
    ...READS,
    ...WRITES,
    'stores:write',
    'integrations:write',
    'notifications:write',
    'members:manage',
    'apikeys:manage',
  ],
  // Everything except issuing API keys (kept owner-only).
  ADMIN: [
    ...READS,
    ...WRITES,
    'stores:write',
    'integrations:write',
    'notifications:write',
    'members:manage',
  ],
  // Day-to-day catalog & order operations only.
  STAFF: [...READS, ...WRITES],
};

export function permissionsForRole(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/** The actor behind a request: a human (with a role) or an API key. */
export type Actor =
  | { kind: 'user'; userId: string; role: Role; permissions: Permission[] }
  | { kind: 'apiKey'; permissions: Permission[] };

/** Every permission, granted to API keys. */
export const ALL_PERMISSIONS: Permission[] = Array.from(
  new Set(Object.values(ROLE_PERMISSIONS).flat()),
);

export function actorHasPermission(actor: Actor | undefined, permission: Permission): boolean {
  if (!actor) return false;
  return actor.permissions.includes(permission);
}

/** Throws ForbiddenError (→ 403) if the context's actor lacks `permission`. */
export function requirePermission(ctx: TenantContext, permission: Permission): void {
  if (!actorHasPermission(ctx.actor, permission)) {
    throw new ForbiddenError(`Missing required permission: ${permission}`);
  }
}
