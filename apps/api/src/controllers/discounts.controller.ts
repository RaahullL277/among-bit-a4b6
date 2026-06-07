import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { getCommerce, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

/** Merchant discount/coupon codes. */
@Controller('discounts')
export class DiscountsController {
  private readonly commerce = getCommerce();

  @Get()
  @Permissions('orders:read')
  list(@Tenant() t: TenantContext, @Query('storeId') storeId: string): Promise<unknown> {
    return this.commerce.discounts.list(t, storeId);
  }

  @Post()
  @Permissions('orders:write')
  create(@Tenant() t: TenantContext, @Body() body: any): Promise<unknown> {
    return this.commerce.discounts.create(t, body);
  }

  @Post(':id/active')
  @Permissions('orders:write')
  setActive(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: { active: boolean }): Promise<unknown> {
    return this.commerce.discounts.setActive(t, id, body?.active ?? false);
  }

  @Delete(':id')
  @Permissions('orders:write')
  remove(@Tenant() t: TenantContext, @Param('id') id: string): Promise<unknown> {
    return this.commerce.discounts.remove(t, id);
  }
}
