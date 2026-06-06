import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { getCommerce, type LoyaltyProgramInput, type LoyaltyTxnType, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

/** Merchant loyalty / rewards: program config + customer point accounts. */
@Controller('loyalty')
export class LoyaltyController {
  private readonly commerce = getCommerce();

  @Get('program')
  @Permissions('customers:read')
  getProgram(@Tenant() t: TenantContext, @Query('storeId') storeId: string): Promise<any> {
    return this.commerce.loyalty.getProgram(t, storeId);
  }

  @Put('program')
  @Permissions('customers:write')
  setProgram(@Tenant() t: TenantContext, @Body() body: LoyaltyProgramInput) {
    return this.commerce.loyalty.setProgram(t, body);
  }

  @Get('accounts')
  @Permissions('customers:read')
  accounts(@Tenant() t: TenantContext, @Query('storeId') storeId: string): Promise<any> {
    return this.commerce.loyalty.listAccounts(t, storeId);
  }

  @Get('accounts/:customerId')
  @Permissions('customers:read')
  account(@Tenant() t: TenantContext, @Param('customerId') customerId: string): Promise<any> {
    return this.commerce.loyalty.account(t, customerId);
  }

  @Post('accounts/:customerId/adjust')
  @Permissions('customers:write')
  adjust(
    @Tenant() t: TenantContext,
    @Param('customerId') customerId: string,
    @Body() body: { points: number; note?: string; type?: LoyaltyTxnType },
  ) {
    return this.commerce.loyalty.award(t, customerId, body.points, body.note, body.type);
  }
}
