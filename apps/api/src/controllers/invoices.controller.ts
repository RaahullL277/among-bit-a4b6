import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { getCommerce, renderInvoiceHtml, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

/** Merchant GST tax invoices (item 2). Gated by order permissions. */
@Controller('invoices')
export class InvoicesController {
  private readonly commerce = getCommerce();

  @Get()
  @Permissions('orders:read')
  list(
    @Tenant() t: TenantContext,
    @Query('storeId') storeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<unknown> {
    return this.commerce.invoices.list(t, { storeId, from, to });
  }

  @Get('credit-notes')
  @Permissions('orders:read')
  creditNotes(@Tenant() t: TenantContext, @Query('storeId') storeId?: string): Promise<unknown> {
    return this.commerce.invoices.creditNotes(t, { storeId });
  }

  @Get('by-order/:orderId')
  @Permissions('orders:read')
  byOrder(@Tenant() t: TenantContext, @Param('orderId') orderId: string): Promise<unknown> {
    return this.commerce.invoices.getByOrder(t, orderId);
  }

  @Get(':id')
  @Permissions('orders:read')
  get(@Tenant() t: TenantContext, @Param('id') id: string): Promise<unknown> {
    return this.commerce.invoices.get(t, id);
  }

  /** Printable HTML tax invoice (open in a browser tab / print to PDF). */
  @Get(':id/html')
  @Permissions('orders:read')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async html(@Tenant() t: TenantContext, @Param('id') id: string): Promise<string> {
    const inv = await this.commerce.invoices.get(t, id);
    return renderInvoiceHtml(inv);
  }
}
