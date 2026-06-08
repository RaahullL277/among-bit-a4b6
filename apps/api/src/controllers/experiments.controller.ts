import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { getCommerce, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

/** Merchant/agent management of storefront A/B + cohort-targeted experiments. */
@Controller('experiments')
export class ExperimentsController {
  private readonly commerce = getCommerce();

  @Get()
  @Permissions('orders:read')
  list(@Tenant() t: TenantContext, @Query('storeId') storeId: string) {
    return this.commerce.experiments.list(t, storeId);
  }

  @Get(':id')
  @Permissions('orders:read')
  get(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.commerce.experiments.get(t, id);
  }

  @Get(':id/results')
  @Permissions('orders:read')
  results(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.commerce.experiments.results(t, id);
  }

  @Post()
  @Permissions('stores:write')
  create(@Tenant() t: TenantContext, @Body() body: any) {
    return this.commerce.experiments.create(t, body);
  }

  @Post(':id/variants')
  @Permissions('stores:write')
  addVariant(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: any) {
    return this.commerce.experiments.addVariant(t, id, body ?? {});
  }

  @Patch('variants/:variantId')
  @Permissions('stores:write')
  updateVariant(@Tenant() t: TenantContext, @Param('variantId') variantId: string, @Body() body: any) {
    return this.commerce.experiments.updateVariant(t, variantId, body ?? {});
  }

  @Delete('variants/:variantId')
  @Permissions('stores:write')
  removeVariant(@Tenant() t: TenantContext, @Param('variantId') variantId: string) {
    return this.commerce.experiments.removeVariant(t, variantId);
  }

  @Post(':id/status')
  @Permissions('stores:write')
  setStatus(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: { status: any }) {
    return this.commerce.experiments.setStatus(t, id, body?.status);
  }

  @Post(':id/promote')
  @Permissions('stores:write')
  promote(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: { variantId: string }) {
    return this.commerce.experiments.promoteWinner(t, id, body?.variantId);
  }
}
