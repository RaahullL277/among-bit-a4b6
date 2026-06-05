import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { getCommerce, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';

@Controller('customers')
export class CustomersController {
  private readonly commerce = getCommerce();

  @Post()
  create(@Tenant() t: TenantContext, @Body() body: any) {
    return this.commerce.customers.create(t, body);
  }

  @Get()
  list(@Tenant() t: TenantContext, @Query('storeId') storeId: string) {
    return this.commerce.customers.list(t, storeId);
  }

  @Get(':id')
  get(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.commerce.customers.get(t, id);
  }
}
