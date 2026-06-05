import { Controller, Get, Query } from '@nestjs/common';
import { getCommerce, type Interval, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

@Controller('analytics')
@Permissions('orders:read')
export class AnalyticsController {
  private readonly commerce = getCommerce();

  @Get('summary')
  summary(
    @Tenant() t: TenantContext,
    @Query('storeId') storeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.commerce.analytics.summary(t, { storeId, from, to });
  }

  @Get('revenue')
  revenue(
    @Tenant() t: TenantContext,
    @Query('storeId') storeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('interval') interval?: Interval,
  ) {
    return this.commerce.analytics.revenueSeries(t, { storeId, from, to, interval });
  }

  @Get('funnel')
  funnel(
    @Tenant() t: TenantContext,
    @Query('storeId') storeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.commerce.analytics.funnel(t, { storeId, from, to });
  }

  @Get('top-products')
  topProducts(
    @Tenant() t: TenantContext,
    @Query('storeId') storeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.commerce.analytics.topProducts(t, {
      storeId,
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
