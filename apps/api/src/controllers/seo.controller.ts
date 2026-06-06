import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { getCommerce, type CreateImageInput, type SeoSettingsInput, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

/** Merchant SEO audit/settings + image optimization. */
@Controller()
export class SeoController {
  private readonly commerce = getCommerce();

  // --- SEO ------------------------------------------------------------------
  @Get('seo/settings')
  @Permissions('products:read')
  getSettings(@Tenant() t: TenantContext, @Query('storeId') storeId: string): Promise<any> {
    return this.commerce.seo.getSettings(t, storeId);
  }

  @Put('seo/settings')
  @Permissions('products:write')
  setSettings(@Tenant() t: TenantContext, @Body() body: SeoSettingsInput) {
    return this.commerce.seo.setSettings(t, body);
  }

  @Get('seo/audit')
  @Permissions('products:read')
  audit(@Tenant() t: TenantContext, @Query('storeId') storeId: string): Promise<any> {
    return this.commerce.seo.audit(t, storeId);
  }

  // --- Images ---------------------------------------------------------------
  @Get('images')
  @Permissions('products:read')
  listImages(@Tenant() t: TenantContext, @Query('storeId') storeId: string, @Query('productId') productId?: string): Promise<any> {
    return this.commerce.images.list(t, { storeId, productId });
  }

  @Get('images/savings')
  @Permissions('products:read')
  savings(@Tenant() t: TenantContext, @Query('storeId') storeId: string): Promise<any> {
    return this.commerce.images.savings(t, storeId);
  }

  @Post('images')
  @Permissions('products:write')
  createImage(@Tenant() t: TenantContext, @Body() body: CreateImageInput) {
    return this.commerce.images.create(t, body);
  }

  @Post('images/optimize-all')
  @Permissions('products:write')
  optimizeAll(@Tenant() t: TenantContext, @Body() body: { storeId: string }): Promise<any> {
    return this.commerce.images.optimizeAll(t, body.storeId);
  }

  @Post('images/:id/optimize')
  @Permissions('products:write')
  optimize(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.commerce.images.optimize(t, id);
  }

  @Post('images/:id/alt')
  @Permissions('products:write')
  setAlt(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: { alt?: string; generate?: boolean }) {
    if (body?.generate) return this.commerce.images.generateAlt(t, id);
    return this.commerce.images.setAlt(t, id, body?.alt ?? '');
  }

  @Delete('images/:id')
  @Permissions('products:write')
  removeImage(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.commerce.images.remove(t, id);
  }
}
