import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { getCommerce, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

@Controller('integrations')
export class IntegrationsController {
  private readonly commerce = getCommerce();

  /** Configure (or update) a provider's credentials for a store. */
  @Post()
  @Permissions('integrations:write')
  configure(@Tenant() t: TenantContext, @Body() body: any) {
    return this.commerce.integrations.configure(t, body);
  }

  @Get()
  @Permissions('stores:read')
  list(@Tenant() t: TenantContext, @Query('storeId') storeId: string) {
    return this.commerce.integrations.list(t, storeId);
  }
}
