import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { getCommerce, type PageStatus, type UpsertPageInput, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

/**
 * Merchant store-design surface: builder pages + theme. Gated by the
 * `products:read/write` permissions (store-content authoring).
 */
@Controller()
export class PagesController {
  private readonly commerce = getCommerce();

  // --- Theme ----------------------------------------------------------------
  @Get('theme')
  @Permissions('products:read')
  getTheme(@Tenant() t: TenantContext, @Query('storeId') storeId: string): Promise<any> {
    return this.commerce.pages.getTheme(t, storeId);
  }

  @Put('theme')
  @Permissions('products:write')
  setTheme(@Tenant() t: TenantContext, @Body() body: any) {
    return this.commerce.pages.setTheme(t, body);
  }

  // --- Pages ----------------------------------------------------------------
  @Get('pages')
  @Permissions('products:read')
  list(@Tenant() t: TenantContext, @Query('storeId') storeId: string): Promise<any> {
    return this.commerce.pages.list(t, storeId);
  }

  @Get('pages/:id')
  @Permissions('products:read')
  get(@Tenant() t: TenantContext, @Param('id') id: string): Promise<any> {
    return this.commerce.pages.get(t, id);
  }

  @Post('pages')
  @Permissions('products:write')
  create(@Tenant() t: TenantContext, @Body() body: UpsertPageInput): Promise<any> {
    return this.commerce.pages.create(t, body);
  }

  @Patch('pages/:id')
  @Permissions('products:write')
  update(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: UpsertPageInput): Promise<any> {
    return this.commerce.pages.update(t, id, body);
  }

  @Post('pages/:id/status')
  @Permissions('products:write')
  setStatus(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: { status: PageStatus }): Promise<any> {
    return this.commerce.pages.setStatus(t, id, body.status);
  }

  @Delete('pages/:id')
  @Permissions('products:write')
  remove(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.commerce.pages.remove(t, id);
  }
}
