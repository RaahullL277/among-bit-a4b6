import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { getCommerce, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

@Controller()
export class StockController {
  private readonly commerce = getCommerce();

  /** R/A/G stock status for every variant in a store. */
  @Get('stores/:id/stock')
  @Permissions('products:read')
  status(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.commerce.stock.getStockStatus(t, id);
  }

  @Get('stock-policy')
  @Permissions('products:read')
  getPolicy(@Tenant() t: TenantContext, @Query('storeId') storeId: string) {
    return this.commerce.stock.getPolicy(t, storeId);
  }

  @Put('stock-policy')
  @Permissions('products:write')
  setPolicy(@Tenant() t: TenantContext, @Body() body: any) {
    return this.commerce.stock.setPolicy(t, body);
  }

  /** Recompute status across stores and alert on degradations. */
  @Post('stock/recompute')
  @Permissions('products:write')
  recompute() {
    return this.commerce.stock.recomputeAndAlert();
  }
}
