import { Body, Controller, ForbiddenException, Get, Put } from '@nestjs/common';
import { getCommerce, type PartnerAccessLevel, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

/**
 * Lets a merchant (the client) see which partner manages their store and choose
 * how much it may do — MANAGE / VIEW / NONE. Partners cannot change their own
 * access (only real merchant actors may), so the client always stays in control.
 */
@Controller('partner-access')
export class PartnerAccessController {
  private readonly commerce = getCommerce();

  @Get()
  @Permissions('stores:read')
  get(@Tenant() t: TenantContext): Promise<any> {
    return this.commerce.partners.getAccessForTenant(t.tenantId);
  }

  @Put()
  @Permissions('members:manage')
  set(@Tenant() t: TenantContext, @Body() body: { accessLevel: PartnerAccessLevel }) {
    if (t.actor?.kind === 'partner') {
      throw new ForbiddenException('A partner cannot change its own access level.');
    }
    return this.commerce.partners.setAccessForTenant(t.tenantId, body.accessLevel);
  }
}
