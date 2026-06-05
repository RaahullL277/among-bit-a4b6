import { Body, Controller, Post } from '@nestjs/common';
import { getCommerce, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';

@Controller('payments')
export class PaymentsController {
  private readonly commerce = getCommerce();

  /** Create an order + payment through the store's active payment provider. */
  @Post('checkout')
  checkout(@Tenant() t: TenantContext, @Body() body: any) {
    return this.commerce.payments.checkout(t, body);
  }
}
