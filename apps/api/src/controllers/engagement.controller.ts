import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { getCommerce, type TenantContext } from '@acp/core';
import type { EngagementTrigger, NotificationChannel } from '@prisma/client';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

/**
 * Engagement automation: a 5-variant template library per channel for nine
 * triggers, hyper-personalised sends, temperature-based frequency caps and
 * cross-cohort dedup. Treated as a marketing/notifications surface (RBAC:
 * notifications:write to configure/run, customers:read to view).
 */
@Controller('engagement')
export class EngagementController {
  private readonly commerce = getCommerce();

  // --- Template library -----------------------------------------------------

  @Get('templates')
  @Permissions('customers:read')
  templates(
    @Query('trigger') trigger?: EngagementTrigger,
    @Query('channel') channel?: NotificationChannel,
  ): unknown {
    return this.commerce.engagement.listTemplates({ trigger, channel });
  }

  @Get('library')
  @Permissions('customers:read')
  library(): unknown {
    return this.commerce.engagement.templateLibrary();
  }

  // --- Campaigns ------------------------------------------------------------

  @Get('campaigns')
  @Permissions('customers:read')
  campaigns(@Tenant() t: TenantContext, @Query('storeId') storeId: string): Promise<unknown> {
    return this.commerce.engagement.listCampaigns(t, storeId);
  }

  @Put('campaigns')
  @Permissions('notifications:write')
  setCampaign(@Tenant() t: TenantContext, @Body() body: any): Promise<unknown> {
    return this.commerce.engagement.setCampaign(t, body);
  }

  @Post('setup-defaults')
  @Permissions('notifications:write')
  setupDefaults(@Tenant() t: TenantContext, @Body() body: { storeId: string; channel?: NotificationChannel }): Promise<unknown> {
    return this.commerce.engagement.setupDefaults(t, body.storeId, body.channel);
  }

  // --- Frequency policy -----------------------------------------------------

  @Get('policy')
  @Permissions('customers:read')
  getPolicy(@Tenant() t: TenantContext, @Query('storeId') storeId: string): Promise<unknown> {
    return this.commerce.engagement.getPolicy(t, storeId);
  }

  @Put('policy')
  @Permissions('notifications:write')
  setPolicy(@Tenant() t: TenantContext, @Body() body: any): Promise<unknown> {
    return this.commerce.engagement.setPolicy(t, body);
  }

  // --- Run / preview / log --------------------------------------------------

  @Post('preview')
  @Permissions('customers:read')
  preview(@Tenant() t: TenantContext, @Body() body: any): Promise<unknown> {
    return this.commerce.engagement.preview(t, body);
  }

  @Post('run')
  @Permissions('notifications:write')
  run(@Tenant() t: TenantContext, @Body() body: { storeId: string; dryRun?: boolean; triggers?: EngagementTrigger[] }): Promise<unknown> {
    return this.commerce.engagement.run(t, body.storeId, { dryRun: body.dryRun, triggers: body.triggers });
  }

  @Get('log')
  @Permissions('customers:read')
  log(
    @Tenant() t: TenantContext,
    @Query('storeId') storeId: string,
    @Query('limit') limit?: string,
    @Query('includeDryRun') includeDryRun?: string,
  ): Promise<unknown> {
    return this.commerce.engagement.listLog(t, storeId, {
      limit: limit ? Number(limit) : undefined,
      includeDryRun: includeDryRun === 'true',
    });
  }
}
