import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { getCommerce, type CreateBundleInput, type UpdateBundleInput, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

/** Merchant management of conversion bundles + frequently-bought-together. */
@Controller('bundles')
export class OffersController {
  private readonly commerce = getCommerce();

  @Get()
  @Permissions('products:read')
  list(@Tenant() t: TenantContext, @Query('storeId') storeId?: string): Promise<any> {
    return this.commerce.offers.listBundles(t, storeId);
  }

  @Get('suggestions')
  @Permissions('products:read')
  suggestions(
    @Tenant() _t: TenantContext,
    @Query('storeId') storeId: string,
    @Query('productId') productId: string,
  ): Promise<any> {
    return this.commerce.offers.frequentlyBoughtTogether(storeId, productId);
  }

  @Get(':id')
  @Permissions('products:read')
  get(@Tenant() t: TenantContext, @Param('id') id: string): Promise<any> {
    return this.commerce.offers.getBundle(t, id);
  }

  @Post()
  @Permissions('products:write')
  create(@Tenant() t: TenantContext, @Body() body: CreateBundleInput): Promise<any> {
    return this.commerce.offers.createBundle(t, body);
  }

  @Patch(':id')
  @Permissions('products:write')
  update(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: UpdateBundleInput): Promise<any> {
    return this.commerce.offers.updateBundle(t, id, body);
  }

  @Delete(':id')
  @Permissions('products:write')
  remove(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.commerce.offers.deleteBundle(t, id);
  }
}
