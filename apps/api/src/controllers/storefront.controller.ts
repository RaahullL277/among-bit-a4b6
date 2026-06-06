import { Body, Controller, Get, Header, Param, Post, Query } from '@nestjs/common';
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

  @Get(':storeId/search')
  search(@Param('storeId') storeId: string, @Query('q') q: string) {
    return this.commerce.storefront.searchProducts(storeId, q ?? '');
  }

  @Get(':storeId/track')
  trackOrder(@Param('storeId') storeId: string, @Query('number') number: string, @Query('email') email: string) {
    return this.commerce.storefront.trackOrder(storeId, Number(number), email);
  }

  // Buyer downloads their GST tax invoice (verified by order number + email).
  @Get(':storeId/invoice')
  invoice(@Param('storeId') storeId: string, @Query('number') number: string, @Query('email') email: string) {
    return this.commerce.storefront.invoice(storeId, Number(number), email);
  }

  @Get(':storeId/invoice.html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async invoiceHtml(
    @Param('storeId') storeId: string,
    @Query('number') number: string,
    @Query('email') email: string,
  ): Promise<string> {
    const html = await this.commerce.storefront.invoiceHtml(storeId, Number(number), email);
    return html ?? '<!doctype html><meta charset="utf-8"><p>Invoice not found.</p>';
  }

  @Get(':storeId/wishlist')
  wishlist(@Param('storeId') storeId: string, @Query('email') email: string) {
    return this.commerce.storefront.wishlist(storeId, email);
  }

  @Post(':storeId/wishlist')
  addWishlist(@Param('storeId') storeId: string, @Body() body: { email: string; productId: string }) {
    return this.commerce.storefront.addToWishlist(storeId, body?.email, body?.productId);
  }

  @Post(':storeId/wishlist/remove')
  removeWishlist(@Param('storeId') storeId: string, @Body() body: { email: string; productId: string }) {
    return this.commerce.storefront.removeFromWishlist(storeId, body?.email, body?.productId);
  }

  // Published legal policies for the storefront footer + policy pages.
  @Get(':storeId/legal')
  legalPolicies(@Param('storeId') storeId: string) {
    return this.commerce.storefront.legalPolicies(storeId);
  }

  @Get(':storeId/legal/:type')
  legalPolicy(@Param('storeId') storeId: string, @Param('type') type: string) {
    return this.commerce.storefront.legalPolicy(storeId, type);
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

  @Get('carts/:cartId/quote')
  quote(@Param('cartId') cartId: string): Promise<unknown> {
    return this.commerce.storefront.checkoutQuote(cartId);
  }

  @Post('carts/:cartId/checkout')
  checkout(@Param('cartId') cartId: string, @Body() body: any) {
    return this.commerce.storefront.checkout(cartId, body ?? {});
  }

  // --- Behaviour tracking (public; feeds cohort intelligence) ----------------
  @Post(':storeId/track')
  track(@Param('storeId') storeId: string, @Body() body: any) {
    return this.commerce.cohorts.track({ storeId, ...(body ?? {}) });
  }

  // --- Marketing consent (public; newsletter opt-in + unsubscribe) ----------
  @Post(':storeId/marketing-consent')
  marketingOptIn(@Param('storeId') storeId: string, @Body() body: { email: string; name?: string }) {
    return this.commerce.customers.optIn(storeId, body?.email, body?.name);
  }

  @Post(':storeId/unsubscribe')
  unsubscribe(@Param('storeId') storeId: string, @Body() body: { email: string }) {
    return this.commerce.customers.unsubscribe(storeId, body?.email);
  }

  // --- Support chatbot (public) ---------------------------------------------
  @Get(':storeId/support/config')
  supportConfig(@Param('storeId') storeId: string) {
    return this.commerce.customerSupport.publicConfig(storeId);
  }

  @Post(':storeId/support/chat')
  supportChat(@Param('storeId') storeId: string, @Body() body: any) {
    return this.commerce.customerSupport.chat({ storeId, ...(body ?? {}) });
  }

  // --- Reviews (public) -----------------------------------------------------
  @Get(':storeId/products/:productId/reviews')
  productReviews(@Param('storeId') storeId: string, @Param('productId') productId: string): Promise<any> {
    return this.commerce.reviews.listForProduct(storeId, productId);
  }

  @Post(':storeId/products/:productId/reviews')
  submitReview(@Param('storeId') storeId: string, @Param('productId') productId: string, @Body() body: any) {
    return this.commerce.reviews.submit({ storeId, productId, ...(body ?? {}) });
  }

  @Get(':storeId/reviews/summary')
  reviewSummaries(@Param('storeId') storeId: string, @Query('productIds') productIds?: string) {
    return this.commerce.reviews.summariesForStore(storeId, productIds ? productIds.split(',').filter(Boolean) : undefined);
  }

  // --- Bundles / frequently bought together (public) ------------------------
  @Get(':storeId/products/:productId/bundles')
  productBundles(@Param('storeId') storeId: string, @Param('productId') productId: string): Promise<any> {
    return this.commerce.offers.bundlesForProduct(storeId, productId);
  }

  @Get(':storeId/products/:productId/frequently-bought-together')
  frequentlyBoughtTogether(@Param('storeId') storeId: string, @Param('productId') productId: string): Promise<any> {
    return this.commerce.offers.frequentlyBoughtTogether(storeId, productId);
  }

  // --- Store design (public) ------------------------------------------------
  @Get(':storeId/theme')
  theme(@Param('storeId') storeId: string): Promise<any> {
    return this.commerce.pages.publicTheme(storeId);
  }

  @Get(':storeId/pages/:slug')
  page(@Param('storeId') storeId: string, @Param('slug') slug: string): Promise<any> {
    return this.commerce.pages.renderPage(storeId, slug);
  }

  // --- Returns & cancellation (public) --------------------------------------
  @Get(':storeId/order-lookup')
  orderLookup(
    @Param('storeId') storeId: string,
    @Query('number') number: string,
    @Query('email') email: string,
  ): Promise<any> {
    return this.commerce.storefront.lookupOrder(storeId, Number(number), email);
  }

  @Get(':storeId/return-policy')
  returnPolicy(@Param('storeId') storeId: string): Promise<any> {
    return this.commerce.returns.publicPolicy(storeId);
  }

  @Post(':storeId/cancel-order')
  cancelOrder(@Param('storeId') storeId: string, @Body() body: { number: number; email: string }) {
    return this.commerce.returns.cancelOrderByCustomer(storeId, Number(body?.number), body?.email);
  }

  @Post(':storeId/returns')
  requestReturn(@Param('storeId') storeId: string, @Body() body: any) {
    return this.commerce.returns.requestPublic(storeId, body ?? {});
  }

  // --- Loyalty (public) -----------------------------------------------------
  @Get(':storeId/loyalty')
  loyalty(@Param('storeId') storeId: string, @Query('email') email: string): Promise<any> {
    return this.commerce.storefront.loyaltyBalance(storeId, email);
  }

  // --- SEO (public) ---------------------------------------------------------
  @Get(':storeId/sitemap.xml')
  @Header('content-type', 'application/xml')
  async sitemap(@Param('storeId') storeId: string): Promise<string> {
    return (await this.commerce.seo.sitemap(storeId)) ?? '';
  }

  @Get(':storeId/robots.txt')
  @Header('content-type', 'text/plain')
  robots(@Param('storeId') storeId: string): Promise<string> {
    return this.commerce.seo.robots(storeId);
  }

  @Get(':storeId/products/:productId/seo')
  productSeo(@Param('storeId') storeId: string, @Param('productId') productId: string): Promise<any> {
    return this.commerce.seo.productMeta(storeId, productId);
  }

  // --- Subscriptions (public) -----------------------------------------------
  @Get(':storeId/subscription-settings')
  subscriptionSettings(@Param('storeId') storeId: string): Promise<any> {
    return this.commerce.storefront.subscriptionSettings(storeId);
  }

  @Post(':storeId/subscriptions')
  subscribe(@Param('storeId') storeId: string, @Body() body: any) {
    return this.commerce.storefront.subscribe(storeId, body ?? {});
  }

  @Get(':storeId/subscriptions')
  mySubscriptions(@Param('storeId') storeId: string, @Query('email') email: string): Promise<any> {
    return this.commerce.storefront.mySubscriptions(storeId, email);
  }

  @Post(':storeId/subscriptions/:id/manage')
  manageSubscription(
    @Param('storeId') storeId: string,
    @Param('id') id: string,
    @Body() body: { email: string; status: any },
  ) {
    return this.commerce.storefront.manageSubscription(storeId, body?.email, id, body?.status);
  }
}
