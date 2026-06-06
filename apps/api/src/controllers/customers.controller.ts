import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { getCommerce, type CustomerSegment, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

/** Customers + lightweight CRM (profiles, segments, tags/notes). */
@Controller('customers')
export class CustomersController {
  private readonly commerce = getCommerce();

  @Post()
  @Permissions('customers:write')
  create(@Tenant() t: TenantContext, @Body() body: any) {
    return this.commerce.customers.create(t, body);
  }

  @Get()
  @Permissions('customers:read')
  list(
    @Tenant() t: TenantContext,
    @Query('storeId') storeId: string,
    @Query('search') search?: string,
    @Query('segment') segment?: CustomerSegment,
  ): Promise<any> {
    return this.commerce.customers.list(t, storeId, { search, segment });
  }

  @Get('summary')
  @Permissions('customers:read')
  summary(@Tenant() t: TenantContext, @Query('storeId') storeId: string): Promise<any> {
    return this.commerce.customers.summary(t, storeId);
  }

  @Get(':id')
  @Permissions('customers:read')
  get(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.commerce.customers.get(t, id);
  }

  @Get(':id/profile')
  @Permissions('customers:read')
  profile(@Tenant() t: TenantContext, @Param('id') id: string): Promise<any> {
    return this.commerce.customers.profile(t, id);
  }

  @Get(':id/cohorts')
  @Permissions('customers:read')
  cohorts(@Tenant() t: TenantContext, @Param('id') id: string): Promise<any> {
    return this.commerce.cohorts.forCustomer(t, id);
  }

  @Get(':id/recommendations')
  @Permissions('customers:read')
  recommendations(@Tenant() t: TenantContext, @Param('id') id: string): Promise<any> {
    return this.commerce.cohorts.recommendations(t, id);
  }

  @Patch(':id')
  @Permissions('customers:write')
  update(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: any) {
    return this.commerce.customers.update(t, id, body);
  }

  @Patch(':id/consent')
  @Permissions('customers:write')
  consent(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: { consent: boolean }) {
    return this.commerce.customers.setMarketingConsent(t, id, Boolean(body?.consent));
  }
}
