import { Controller, Get, Header, Query } from '@nestjs/common';
import { getCommerce, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

/** GST sales register + P&L-lite (item 4). Gated by analytics/order read access. */
@Controller('accounting')
export class AccountingController {
  private readonly commerce = getCommerce();

  @Get('sales-register')
  @Permissions('orders:read')
  salesRegister(
    @Tenant() t: TenantContext,
    @Query('storeId') storeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<unknown> {
    return this.commerce.accounting.salesRegister(t, { storeId, from, to });
  }

  @Get('sales-register.csv')
  @Permissions('orders:read')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="sales-register.csv"')
  salesRegisterCsv(
    @Tenant() t: TenantContext,
    @Query('storeId') storeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<string> {
    return this.commerce.accounting.salesRegisterCsv(t, { storeId, from, to });
  }

  @Get('pnl')
  @Permissions('orders:read')
  profitAndLoss(
    @Tenant() t: TenantContext,
    @Query('storeId') storeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<unknown> {
    return this.commerce.accounting.profitAndLoss(t, { storeId, from, to });
  }
}
