import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { getCommerce, type ReviewStatus, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

/** Merchant review moderation. */
@Controller('reviews')
export class ReviewsController {
  private readonly commerce = getCommerce();

  @Get()
  @Permissions('products:read')
  list(
    @Tenant() t: TenantContext,
    @Query('storeId') storeId?: string,
    @Query('status') status?: ReviewStatus,
    @Query('productId') productId?: string,
  ) {
    return this.commerce.reviews.list(t, { storeId, status, productId });
  }

  @Get('counts')
  @Permissions('products:read')
  counts(@Tenant() t: TenantContext, @Query('storeId') storeId: string) {
    return this.commerce.reviews.counts(t, storeId);
  }

  @Post(':id/moderate')
  @Permissions('products:write')
  moderate(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: { status: ReviewStatus }) {
    return this.commerce.reviews.moderate(t, id, body.status);
  }

  @Post(':id/reply')
  @Permissions('products:write')
  reply(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: { body: string }) {
    return this.commerce.reviews.reply(t, id, body?.body);
  }
}
