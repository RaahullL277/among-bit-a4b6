import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { getCommerce, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

/**
 * Listing agent: snap a photo → auto-generate copy + enhance the image →
 * set price/discount/stock → publish a product. Plus the customisable harness
 * (master prompt, brand voice, rules, photo prefs).
 */
@Controller('listing')
export class ListingController {
  private readonly commerce = getCommerce();

  @Get('config')
  @Permissions('products:read')
  getConfig(@Tenant() t: TenantContext, @Query('storeId') storeId: string): Promise<unknown> {
    return this.commerce.listing.getConfig(t, storeId);
  }

  @Put('config')
  @Permissions('products:write')
  setConfig(@Tenant() t: TenantContext, @Body() body: any): Promise<unknown> {
    return this.commerce.listing.setConfig(t, body);
  }

  @Post('enhance-photo')
  @Permissions('products:write')
  enhancePhoto(@Tenant() t: TenantContext, @Body() body: any): Promise<unknown> {
    return this.commerce.listing.enhancePhoto(t, body);
  }

  @Post('write-content')
  @Permissions('products:write')
  writeContent(@Tenant() t: TenantContext, @Body() body: any): Promise<unknown> {
    return this.commerce.listing.writeContent(t, body);
  }

  @Post('draft')
  @Permissions('products:write')
  draft(@Tenant() t: TenantContext, @Body() body: any): Promise<unknown> {
    return this.commerce.listing.draft(t, body);
  }

  @Post('publish')
  @Permissions('products:write')
  publish(@Tenant() t: TenantContext, @Body() body: any): Promise<unknown> {
    return this.commerce.listing.publish(t, body);
  }
}
