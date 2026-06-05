import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { getCommerce, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

@Controller()
export class NotificationsController {
  private readonly commerce = getCommerce();

  /** Manually dispatch a notification for an event (also used for testing). */
  @Post('notifications/send')
  @Permissions('notifications:write')
  send(@Tenant() t: TenantContext, @Body() body: any): Promise<any> {
    return this.commerce.notifications.notify(t, body);
  }

  @Get('notifications')
  @Permissions('stores:read')
  list(@Tenant() t: TenantContext, @Query('storeId') storeId: string) {
    return this.commerce.notifications.listNotifications(t, storeId);
  }

  @Get('notification-preferences')
  @Permissions('stores:read')
  listPreferences(@Tenant() t: TenantContext, @Query('storeId') storeId: string) {
    return this.commerce.notifications.listPreferences(t, storeId);
  }

  @Put('notification-preferences')
  @Permissions('notifications:write')
  setPreference(@Tenant() t: TenantContext, @Body() body: any) {
    return this.commerce.notifications.setPreference(t, body);
  }
}
