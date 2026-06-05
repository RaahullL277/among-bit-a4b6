import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { getCommerce, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';

@Controller('stores')
export class StoresController {
  private readonly commerce = getCommerce();

  @Post()
  create(@Tenant() t: TenantContext, @Body() body: any) {
    return this.commerce.stores.create(t, body);
  }

  @Get()
  list(@Tenant() t: TenantContext) {
    return this.commerce.stores.list(t);
  }

  @Get(':id')
  get(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.commerce.stores.get(t, id);
  }

  @Patch(':id')
  update(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: any) {
    return this.commerce.stores.update(t, id, body);
  }
}
