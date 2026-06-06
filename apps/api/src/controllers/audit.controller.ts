import { Controller, Get, Query } from '@nestjs/common';
import { getCommerce, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

/**
 * Merchant audit trail: who changed what in this tenant (owner/staff/API key, or
 * a partner under delegated access). Owner/admin only (members:manage).
 */
@Controller('audit')
export class AuditController {
  private readonly commerce = getCommerce();

  @Get()
  @Permissions('members:manage')
  list(
    @Tenant() t: TenantContext,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
    @Query('actorKind') actorKind?: string,
    @Query('resource') resource?: string,
  ): Promise<unknown> {
    return this.commerce.audit.list(t, {
      limit: limit ? Number(limit) : undefined,
      action,
      actorKind,
      resource,
    });
  }
}
