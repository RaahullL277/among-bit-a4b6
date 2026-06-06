import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { getCommerce, type RunApiImportInput, type RunImportInput, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

/** Store bootstrap / migration: import products & customers from Shopify, WooCommerce, Dukaan. */
@Controller('imports')
export class ImportsController {
  private readonly commerce = getCommerce();

  @Get()
  @Permissions('products:read')
  list(@Tenant() t: TenantContext, @Query('storeId') storeId?: string): Promise<unknown> {
    return this.commerce.imports.list(t, storeId);
  }

  @Post()
  @Permissions('products:write')
  run(@Tenant() t: TenantContext, @Body() body: RunImportInput): Promise<unknown> {
    return this.commerce.imports.run(t, body);
  }

  /** Pull live from the source store's API (Shopify Admin API / WooCommerce REST). */
  @Post('api')
  @Permissions('products:write')
  runApi(@Tenant() t: TenantContext, @Body() body: RunApiImportInput): Promise<unknown> {
    return this.commerce.imports.runFromApi(t, body);
  }

  @Get(':id')
  @Permissions('products:read')
  get(@Tenant() t: TenantContext, @Param('id') id: string): Promise<unknown> {
    return this.commerce.imports.get(t, id);
  }
}
