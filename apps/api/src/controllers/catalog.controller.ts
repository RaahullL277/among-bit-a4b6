import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { getCommerce, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

/** Merchant catalog merchandising: options, attributes, collections, assets, B2B tiers, images. */
@Controller('catalog')
export class CatalogController {
  private readonly commerce = getCommerce();

  // --- Collections (categories) ---------------------------------------------
  @Get('collections')
  @Permissions('products:read')
  listCollections(@Tenant() t: TenantContext, @Query('storeId') storeId: string): Promise<unknown> {
    return this.commerce.catalog.listCollections(t, storeId);
  }

  @Post('collections')
  @Permissions('products:write')
  createCollection(@Tenant() t: TenantContext, @Body() body: any): Promise<unknown> {
    return this.commerce.catalog.createCollection(t, body);
  }

  @Put('collections/:id')
  @Permissions('products:write')
  updateCollection(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: any): Promise<unknown> {
    return this.commerce.catalog.updateCollection(t, id, body);
  }

  @Delete('collections/:id')
  @Permissions('products:write')
  removeCollection(@Tenant() t: TenantContext, @Param('id') id: string): Promise<unknown> {
    return this.commerce.catalog.removeCollection(t, id);
  }

  @Put('products/:productId/collections')
  @Permissions('products:write')
  setProductCollections(@Tenant() t: TenantContext, @Param('productId') productId: string, @Body() body: { collectionIds: string[] }): Promise<unknown> {
    return this.commerce.catalog.setProductCollections(t, productId, body?.collectionIds ?? []);
  }

  // --- Options (variant axes) -----------------------------------------------
  @Get('products/:productId/options')
  @Permissions('products:read')
  getOptions(@Tenant() t: TenantContext, @Param('productId') productId: string): Promise<unknown> {
    return this.commerce.catalog.getOptions(t, productId);
  }

  @Put('products/:productId/options')
  @Permissions('products:write')
  setOptions(@Tenant() t: TenantContext, @Param('productId') productId: string, @Body() body: { options: any[] }): Promise<unknown> {
    return this.commerce.catalog.setOptions(t, productId, body?.options ?? []);
  }

  // --- Attributes / specs ---------------------------------------------------
  @Get('products/:productId/attributes')
  @Permissions('products:read')
  getAttributes(@Tenant() t: TenantContext, @Param('productId') productId: string): Promise<unknown> {
    return this.commerce.catalog.getAttributes(t, productId);
  }

  @Put('products/:productId/attributes')
  @Permissions('products:write')
  setAttributes(@Tenant() t: TenantContext, @Param('productId') productId: string, @Body() body: { attributes: any[] }): Promise<unknown> {
    return this.commerce.catalog.setAttributes(t, productId, body?.attributes ?? []);
  }

  // --- Document assets ------------------------------------------------------
  @Get('products/:productId/assets')
  @Permissions('products:read')
  listAssets(@Tenant() t: TenantContext, @Param('productId') productId: string): Promise<unknown> {
    return this.commerce.catalog.listAssets(t, productId);
  }

  @Post('products/:productId/assets')
  @Permissions('products:write')
  addAsset(@Tenant() t: TenantContext, @Param('productId') productId: string, @Body() body: any): Promise<unknown> {
    return this.commerce.catalog.addAsset(t, { productId, ...body });
  }

  @Delete('assets/:id')
  @Permissions('products:write')
  removeAsset(@Tenant() t: TenantContext, @Param('id') id: string): Promise<unknown> {
    return this.commerce.catalog.removeAsset(t, id);
  }

  // --- B2B price tiers ------------------------------------------------------
  @Get('variants/:variantId/price-tiers')
  @Permissions('products:read')
  getTiers(@Tenant() t: TenantContext, @Param('variantId') variantId: string): Promise<unknown> {
    return this.commerce.catalog.getTiers(t, variantId);
  }

  @Put('variants/:variantId/price-tiers')
  @Permissions('products:write')
  setTiers(@Tenant() t: TenantContext, @Param('variantId') variantId: string, @Body() body: { tiers: any[] }): Promise<unknown> {
    return this.commerce.catalog.setPriceTiers(t, variantId, body?.tiers ?? []);
  }

  // --- Product images -------------------------------------------------------
  @Get('products/:productId/images')
  @Permissions('products:read')
  listImages(@Tenant() t: TenantContext, @Param('productId') productId: string): Promise<unknown> {
    return this.commerce.images.productImages(productId);
  }

  @Post('images')
  @Permissions('products:write')
  addImage(@Tenant() t: TenantContext, @Body() body: any): Promise<unknown> {
    return this.commerce.images.create(t, body);
  }

  @Post('images/:id/primary')
  @Permissions('products:write')
  setPrimary(@Tenant() t: TenantContext, @Param('id') id: string): Promise<unknown> {
    return this.commerce.images.setPrimary(t, id);
  }

  @Put('products/:productId/images/reorder')
  @Permissions('products:write')
  reorderImages(@Tenant() t: TenantContext, @Param('productId') productId: string, @Body() body: { orderedIds: string[] }): Promise<unknown> {
    return this.commerce.images.reorder(t, productId, body?.orderedIds ?? []);
  }

  @Delete('images/:id')
  @Permissions('products:write')
  removeImage(@Tenant() t: TenantContext, @Param('id') id: string): Promise<unknown> {
    return this.commerce.images.remove(t, id);
  }
}
