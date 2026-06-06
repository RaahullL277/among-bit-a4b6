import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { getCommerce, type AddCompetitorInput, type PricingRuleInput, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

/** Pricing intelligence: competitor tracking, margin analysis, and repricing. */
@Controller('pricing')
export class PricingController {
  private readonly commerce = getCommerce();

  // --- Rule -----------------------------------------------------------------
  @Get('rule')
  @Permissions('products:read')
  getRule(@Tenant() t: TenantContext, @Query('storeId') storeId: string): Promise<any> {
    return this.commerce.pricing.getRule(t, storeId);
  }

  @Put('rule')
  @Permissions('products:write')
  setRule(@Tenant() t: TenantContext, @Body() body: PricingRuleInput) {
    return this.commerce.pricing.setRule(t, body);
  }

  // --- Analysis & repricing -------------------------------------------------
  @Get('analyze')
  @Permissions('products:read')
  analyze(@Tenant() t: TenantContext, @Query('storeId') storeId: string): Promise<any> {
    return this.commerce.pricing.analyze(t, storeId);
  }

  @Post('reprice')
  @Permissions('products:write')
  reprice(@Tenant() t: TenantContext, @Body() body: { storeId: string; apply?: boolean }): Promise<any> {
    return this.commerce.pricing.reprice(t, body.storeId, { apply: body.apply });
  }

  @Post('refresh')
  @Permissions('products:write')
  refresh(@Tenant() t: TenantContext, @Body() body: { storeId: string }): Promise<any> {
    return this.commerce.pricing.refreshCompetitors(t, body.storeId);
  }

  // --- Cost & competitors ---------------------------------------------------
  @Put('variants/:variantId/cost')
  @Permissions('products:write')
  setCost(@Tenant() t: TenantContext, @Param('variantId') variantId: string, @Body() body: { costMinor: number }) {
    return this.commerce.pricing.setCost(t, variantId, body.costMinor);
  }

  @Get('variants/:variantId/competitors')
  @Permissions('products:read')
  listCompetitors(@Tenant() t: TenantContext, @Param('variantId') variantId: string): Promise<any> {
    return this.commerce.pricing.listCompetitors(t, variantId);
  }

  @Post('competitors')
  @Permissions('products:write')
  addCompetitor(@Tenant() t: TenantContext, @Body() body: AddCompetitorInput) {
    return this.commerce.pricing.addCompetitor(t, body);
  }

  @Delete('competitors/:id')
  @Permissions('products:write')
  removeCompetitor(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.commerce.pricing.removeCompetitor(t, id);
  }
}
