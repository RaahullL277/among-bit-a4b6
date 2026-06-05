import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { getCommerce } from '@acp/core';
import { Public } from '../common/public.decorator.js';

/**
 * Public, unauthenticated storefront API. Keyed by store id and cart id
 * (opaque capabilities); only buyer-safe operations are exposed.
 */
@Controller('storefront')
@Public()
export class StorefrontController {
  private readonly commerce = getCommerce();

  @Get(':storeId')
  store(@Param('storeId') storeId: string) {
    return this.commerce.storefront.getStore(storeId);
  }

  @Get(':storeId/products')
  products(@Param('storeId') storeId: string) {
    return this.commerce.storefront.listProducts(storeId);
  }

  @Get(':storeId/products/:productId')
  product(@Param('storeId') storeId: string, @Param('productId') productId: string) {
    return this.commerce.storefront.getProduct(storeId, productId);
  }

  @Post(':storeId/carts')
  createCart(@Param('storeId') storeId: string, @Body() body: any) {
    return this.commerce.storefront.createCart(storeId, body ?? {});
  }

  @Get('carts/:cartId')
  getCart(@Param('cartId') cartId: string) {
    return this.commerce.storefront.getCart(cartId);
  }

  @Post('carts/:cartId/items')
  addItem(@Param('cartId') cartId: string, @Body() body: any) {
    return this.commerce.storefront.addItem(cartId, body);
  }

  @Post('carts/:cartId/checkout')
  checkout(@Param('cartId') cartId: string) {
    return this.commerce.storefront.checkout(cartId);
  }
}
