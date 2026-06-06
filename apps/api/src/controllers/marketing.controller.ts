import { Controller, Get, Post, Query } from '@nestjs/common';
import { getCommerce, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

/** Marketing-email (Klaviyo/Mailchimp/Brevo) sync controls. */
@Controller('marketing')
export class MarketingController {
  private readonly commerce = getCommerce();

  @Get('providers')
  @Permissions('customers:read')
  providers(@Tenant() t: TenantContext, @Query('storeId') storeId: string) {
    return this.commerce.marketing.enabledProviders(t, storeId);
  }

  /** Re-sync all of a store's customers to the enabled ESPs. */
  @Post('sync')
  @Permissions('customers:write')
  sync(@Tenant() t: TenantContext, @Query('storeId') storeId: string) {
    return this.commerce.marketing.syncAll(t, storeId);
  }
}
