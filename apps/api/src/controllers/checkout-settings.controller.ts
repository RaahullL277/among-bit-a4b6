import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { getCommerce, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

/** Merchant tax & shipping settings applied at checkout. */
@Controller('checkout-settings')
export class CheckoutSettingsController {
  private readonly commerce = getCommerce();

  @Get()
  @Permissions('orders:read')
  get(@Tenant() t: TenantContext, @Query('storeId') storeId: string): Promise<unknown> {
    return this.commerce.checkoutSettings.get(t, storeId);
  }

  @Put()
  @Permissions('orders:write')
  set(@Tenant() t: TenantContext, @Body() body: any): Promise<unknown> {
    return this.commerce.checkoutSettings.set(t, body);
  }
}
