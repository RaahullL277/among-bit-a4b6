import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  getCommerce,
  type CreateSubscriptionInput,
  type SubscriptionSettingsInput,
  type SubscriptionStatus,
  type TenantContext,
} from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

/** Merchant subscription management + the storefront "subscribe & save" settings. */
@Controller('subscriptions')
export class SubscriptionsController {
  private readonly commerce = getCommerce();

  @Get('settings')
  @Permissions('orders:read')
  getSettings(@Tenant() t: TenantContext, @Query('storeId') storeId: string): Promise<any> {
    return this.commerce.subscriptions.getSettings(t, storeId);
  }

  @Put('settings')
  @Permissions('orders:write')
  setSettings(@Tenant() t: TenantContext, @Body() body: SubscriptionSettingsInput) {
    return this.commerce.subscriptions.setSettings(t, body);
  }

  @Get()
  @Permissions('orders:read')
  list(
    @Tenant() t: TenantContext,
    @Query('storeId') storeId?: string,
    @Query('status') status?: SubscriptionStatus,
  ): Promise<any> {
    return this.commerce.subscriptions.list(t, { storeId, status });
  }

  @Get('counts')
  @Permissions('orders:read')
  counts(@Tenant() t: TenantContext, @Query('storeId') storeId: string): Promise<any> {
    return this.commerce.subscriptions.counts(t, storeId);
  }

  @Post()
  @Permissions('orders:write')
  create(@Tenant() t: TenantContext, @Body() body: CreateSubscriptionInput): Promise<any> {
    return this.commerce.subscriptions.create(t, body);
  }

  @Patch(':id')
  @Permissions('orders:write')
  update(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: any) {
    return this.commerce.subscriptions.update(t, id, body);
  }

  @Post(':id/status')
  @Permissions('orders:write')
  setStatus(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: { status: SubscriptionStatus }) {
    return this.commerce.subscriptions.setStatus(t, id, body.status);
  }

  @Post('run-billing')
  @Permissions('orders:write')
  runBilling(): Promise<any> {
    return this.commerce.subscriptions.runDueSubscriptions();
  }
}
