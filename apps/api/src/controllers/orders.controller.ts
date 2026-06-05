import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { getCommerce, type OrderStatus, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

@Controller('orders')
export class OrdersController {
  private readonly commerce = getCommerce();

  @Get()
  @Permissions('orders:read')
  list(@Tenant() t: TenantContext, @Query('storeId') storeId?: string) {
    return this.commerce.orders.list(t, storeId);
  }

  @Get(':id')
  @Permissions('orders:read')
  get(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.commerce.orders.get(t, id);
  }

  @Patch(':id/status')
  @Permissions('orders:write')
  updateStatus(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body() body: { status: OrderStatus },
  ) {
    return this.commerce.orders.updateStatus(t, id, body.status);
  }
}
