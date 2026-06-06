import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { getCommerce, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

@Controller('stores')
export class StoresController {
  private readonly commerce = getCommerce();

  @Post()
  @Permissions('stores:write')
  create(@Tenant() t: TenantContext, @Body() body: any) {
    return this.commerce.stores.create(t, body);
  }

  @Get()
  @Permissions('stores:read')
  list(@Tenant() t: TenantContext) {
    return this.commerce.stores.list(t);
  }

  @Get(':id')
  @Permissions('stores:read')
  get(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.commerce.stores.get(t, id);
  }

  @Patch(':id')
  @Permissions('stores:write')
  update(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: any) {
    return this.commerce.stores.update(t, id, body);
  }

  // --- Seller tax identity (GSTIN, legal name, registered address; item 1) ---
  @Get(':id/tax-identity')
  @Permissions('stores:read')
  getTaxIdentity(@Tenant() t: TenantContext, @Param('id') id: string): Promise<unknown> {
    return this.commerce.stores.getTaxIdentity(t, id);
  }

  @Put(':id/tax-identity')
  @Permissions('stores:write')
  setTaxIdentity(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: any) {
    return this.commerce.stores.setTaxIdentity(t, id, body);
  }
}
