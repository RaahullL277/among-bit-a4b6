import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { getCommerce, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

@Controller('products')
export class ProductsController {
  private readonly commerce = getCommerce();

  @Post()
  @Permissions('products:write')
  create(@Tenant() t: TenantContext, @Body() body: any) {
    return this.commerce.products.create(t, body);
  }

  @Get()
  @Permissions('products:read')
  list(@Tenant() t: TenantContext, @Query('storeId') storeId: string) {
    return this.commerce.products.list(t, storeId);
  }

  @Get(':id')
  @Permissions('products:read')
  get(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.commerce.products.get(t, id);
  }

  @Patch('variants/:variantId')
  @Permissions('products:write')
  updateVariant(@Tenant() t: TenantContext, @Param('variantId') variantId: string, @Body() body: any) {
    return this.commerce.products.updateVariant(t, variantId, body);
  }

  @Post(':id/variants')
  @Permissions('products:write')
  addVariant(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: any) {
    return this.commerce.products.addVariant(t, id, body);
  }

  @Patch(':id')
  @Permissions('products:write')
  update(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: any) {
    return this.commerce.products.update(t, id, body);
  }
}
