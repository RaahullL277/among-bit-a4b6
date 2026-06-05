import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { getCommerce, type CartStatus, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

@Controller()
export class CartsController {
  private readonly commerce = getCommerce();

  @Post('carts')
  @Permissions('orders:write')
  create(@Tenant() t: TenantContext, @Body() body: any) {
    return this.commerce.carts.createCart(t, body);
  }

  @Get('carts')
  @Permissions('orders:read')
  list(
    @Tenant() t: TenantContext,
    @Query('storeId') storeId?: string,
    @Query('status') status?: CartStatus,
  ) {
    return this.commerce.carts.listCarts(t, { storeId, status });
  }

  @Get('carts/:id')
  @Permissions('orders:read')
  get(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.commerce.carts.getCart(t, id);
  }

  @Post('carts/:id/items')
  @Permissions('orders:write')
  addItem(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: any) {
    return this.commerce.carts.addItem(t, id, body);
  }

  @Delete('carts/:id/items/:itemId')
  @Permissions('orders:write')
  removeItem(@Tenant() t: TenantContext, @Param('id') id: string, @Param('itemId') itemId: string) {
    return this.commerce.carts.removeItem(t, id, itemId);
  }

  @Post('carts/:id/checkout')
  @Permissions('orders:write')
  checkout(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: any) {
    return this.commerce.carts.checkoutCart(t, id, body ?? {});
  }

  /** Manually run the recovery job (the worker calls this on a schedule). */
  @Post('carts/run-recovery')
  @Permissions('orders:write')
  runRecovery() {
    return this.commerce.carts.runRecoveryJobs();
  }

  @Get('cart-recovery-policy')
  @Permissions('orders:read')
  getPolicy(@Tenant() t: TenantContext, @Query('storeId') storeId: string) {
    return this.commerce.carts.getPolicy(t, storeId);
  }

  @Put('cart-recovery-policy')
  @Permissions('orders:write')
  setPolicy(@Tenant() t: TenantContext, @Body() body: any) {
    return this.commerce.carts.setPolicy(t, body);
  }
}
