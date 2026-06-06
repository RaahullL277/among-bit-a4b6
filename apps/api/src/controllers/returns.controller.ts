import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { getCommerce, type RequestReturnInput, type ReturnStatus, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

/** Merchant returns / RMA management. Gated by order permissions. */
@Controller('returns')
export class ReturnsController {
  private readonly commerce = getCommerce();

  @Get()
  @Permissions('orders:read')
  list(
    @Tenant() t: TenantContext,
    @Query('storeId') storeId?: string,
    @Query('status') status?: ReturnStatus,
    @Query('orderId') orderId?: string,
  ): Promise<any> {
    return this.commerce.returns.list(t, { storeId, status, orderId });
  }

  @Get('counts')
  @Permissions('orders:read')
  counts(@Tenant() t: TenantContext, @Query('storeId') storeId: string): Promise<any> {
    return this.commerce.returns.counts(t, storeId);
  }

  @Get('policy')
  @Permissions('orders:read')
  getPolicy(@Tenant() t: TenantContext, @Query('storeId') storeId: string): Promise<any> {
    return this.commerce.returns.getPolicy(t, storeId);
  }

  @Put('policy')
  @Permissions('orders:write')
  setPolicy(@Tenant() t: TenantContext, @Body() body: any): Promise<any> {
    return this.commerce.returns.setPolicy(t, body);
  }

  @Get(':id')
  @Permissions('orders:read')
  get(@Tenant() t: TenantContext, @Param('id') id: string): Promise<any> {
    return this.commerce.returns.get(t, id);
  }

  @Post()
  @Permissions('orders:write')
  create(@Tenant() t: TenantContext, @Body() body: RequestReturnInput) {
    return this.commerce.returns.request(t, body);
  }

  @Post(':id/approve')
  @Permissions('orders:write')
  approve(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: { note?: string }) {
    return this.commerce.returns.approve(t, id, body?.note);
  }

  @Post(':id/reject')
  @Permissions('orders:write')
  reject(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: { note?: string }) {
    return this.commerce.returns.reject(t, id, body?.note);
  }

  @Post(':id/receive')
  @Permissions('orders:write')
  receive(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.commerce.returns.markReceived(t, id);
  }

  @Post(':id/refund')
  @Permissions('orders:write')
  refund(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: { amountMinor?: number }) {
    return this.commerce.returns.refund(t, id, body?.amountMinor);
  }
}
