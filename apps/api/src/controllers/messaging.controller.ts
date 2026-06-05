import { Body, Controller, Param, Post } from '@nestjs/common';
import { getCommerce, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';

@Controller('messaging')
export class MessagingController {
  private readonly commerce = getCommerce();

  @Post('send')
  send(@Tenant() t: TenantContext, @Body() body: any): Promise<any> {
    return this.commerce.messaging.send(t, body);
  }

  @Post('template')
  sendTemplate(@Tenant() t: TenantContext, @Body() body: any): Promise<any> {
    return this.commerce.messaging.sendTemplate(t, body);
  }

  /** Automation: notify a customer of their order's current status. */
  @Post('notify-order/:orderId')
  notifyOrder(@Tenant() t: TenantContext, @Param('orderId') orderId: string): Promise<any> {
    return this.commerce.messaging.notifyOrderUpdate(t, orderId);
  }
}
