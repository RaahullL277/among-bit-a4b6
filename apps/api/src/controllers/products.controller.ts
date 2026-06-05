import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { getCommerce, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';

@Controller('products')
export class ProductsController {
  private readonly commerce = getCommerce();

  @Post()
  create(@Tenant() t: TenantContext, @Body() body: any) {
    return this.commerce.products.create(t, body);
  }

  @Get()
  list(@Tenant() t: TenantContext, @Query('storeId') storeId: string) {
    return this.commerce.products.list(t, storeId);
  }

  @Get(':id')
  get(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.commerce.products.get(t, id);
  }

  @Patch(':id')
  update(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: any) {
    return this.commerce.products.update(t, id, body);
  }
}
