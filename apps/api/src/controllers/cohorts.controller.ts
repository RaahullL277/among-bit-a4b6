import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { getCommerce, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

/** Cohort intelligence: ML micro-cohorts + recompute. */
@Controller('cohorts')
export class CohortsController {
  private readonly commerce = getCommerce();

  @Get()
  @Permissions('customers:read')
  list(@Tenant() t: TenantContext, @Query('storeId') storeId: string): Promise<any> {
    return this.commerce.cohorts.list(t, storeId);
  }

  @Post('recompute')
  @Permissions('customers:write')
  recompute(@Tenant() t: TenantContext, @Body() body: { storeId: string }): Promise<any> {
    return this.commerce.cohorts.recompute(t, body.storeId);
  }
}
