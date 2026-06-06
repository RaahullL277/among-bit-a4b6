import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { getCommerce, type LegalPolicyType, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

/** Store legal policies (Terms, Privacy, Shipping, Refund, Cookies). */
@Controller('legal')
export class LegalController {
  private readonly commerce = getCommerce();

  @Get()
  @Permissions('stores:read')
  list(@Tenant() t: TenantContext, @Query('storeId') storeId: string): Promise<unknown> {
    return this.commerce.legal.list(t, storeId);
  }

  @Put()
  @Permissions('stores:write')
  set(@Tenant() t: TenantContext, @Body() body: any): Promise<unknown> {
    return this.commerce.legal.set(t, body);
  }

  /** Generate one policy (with `type`) or all five (omit `type`) from templates. */
  @Post('generate')
  @Permissions('stores:write')
  generate(@Tenant() t: TenantContext, @Body() body: { storeId: string; type?: LegalPolicyType; publish?: boolean }): Promise<unknown> {
    return body?.type
      ? this.commerce.legal.generate(t, body.storeId, body.type, { publish: body.publish })
      : this.commerce.legal.generateAll(t, body.storeId, { publish: body?.publish });
  }

  @Post('status')
  @Permissions('stores:write')
  setStatus(@Tenant() t: TenantContext, @Body() body: { storeId: string; type: LegalPolicyType; status: 'DRAFT' | 'PUBLISHED' }): Promise<unknown> {
    return this.commerce.legal.setStatus(t, body.storeId, body.type, body.status);
  }

  /** Buyer legal-acceptance consent trail (declared before :type so it isn't shadowed). */
  @Get('acceptances')
  @Permissions('stores:read')
  acceptances(@Tenant() t: TenantContext, @Query('storeId') storeId: string): Promise<unknown> {
    return this.commerce.legal.listAcceptances(t, storeId);
  }

  @Get(':type')
  @Permissions('stores:read')
  get(@Tenant() t: TenantContext, @Param('type') type: LegalPolicyType, @Query('storeId') storeId: string): Promise<unknown> {
    return this.commerce.legal.get(t, storeId, type);
  }
}
