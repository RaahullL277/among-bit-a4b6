import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { getCommerce, type SupportConversationStatus, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

/** Merchant-facing support inbox + chatbot configuration. */
@Controller('support')
export class SupportController {
  private readonly commerce = getCommerce();

  @Get('bot-config')
  @Permissions('customers:read')
  getConfig(@Tenant() t: TenantContext, @Query('storeId') storeId: string) {
    return this.commerce.customerSupport.getConfig(t, storeId);
  }

  @Put('bot-config')
  @Permissions('customers:write')
  setConfig(@Tenant() t: TenantContext, @Body() body: any) {
    return this.commerce.customerSupport.setConfig(t, body);
  }

  @Get('conversations')
  @Permissions('customers:read')
  list(
    @Tenant() t: TenantContext,
    @Query('storeId') storeId?: string,
    @Query('status') status?: SupportConversationStatus,
  ) {
    return this.commerce.customerSupport.listConversations(t, { storeId, status });
  }

  @Get('conversations/:id')
  @Permissions('customers:read')
  get(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.commerce.customerSupport.getConversation(t, id);
  }

  @Post('conversations/:id/reply')
  @Permissions('customers:write')
  reply(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: { body: string }) {
    return this.commerce.customerSupport.reply(t, id, body?.body);
  }

  @Post('conversations/:id/status')
  @Permissions('customers:write')
  setStatus(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: { status: SupportConversationStatus }) {
    return this.commerce.customerSupport.setStatus(t, id, body.status);
  }
}
