// Imported as a type only to avoid a runtime cycle with authz.ts.
import type { Actor } from './authz.js';

/**
 * Every domain operation runs inside a TenantContext. The service layer always
 * scopes its queries by `ctx.tenantId`, which is how multi-tenant isolation is
 * enforced centrally rather than per call-site.
 */
export interface TenantContext {
  tenantId: string;
  /** Scopes attached to the authenticating API key (reserved for partner apps). */
  scopes?: string[];
  /** Who is making the request (a user with a role, or an API key). */
  actor?: Actor;
}

export class NotFoundError extends Error {
  constructor(entity: string, id?: string) {
    super(id ? `${entity} not found: ${id}` : `${entity} not found`);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthError extends Error {
  constructor(message = 'Invalid or missing credentials') {
    super(message);
    this.name = 'AuthError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'You do not have permission to do that') {
    super(message);
    this.name = 'ForbiddenError';
  }
}
