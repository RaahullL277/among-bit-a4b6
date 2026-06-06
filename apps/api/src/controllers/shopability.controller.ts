import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { getCommerce, type TenantContext } from '@acp/core';
import type { AgentChannel } from '@prisma/client';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

/**
 * Store-owner / partner controls for AI-assistant shopability. A partner with
 * delegated MANAGE access has stores:write and can toggle it too; VIEW gets
 * stores:read. Mirrored by the MCP connector so it's controllable "through Claude".
 */
@Controller('shopability')
export class ShopabilityController {
  private readonly commerce = getCommerce();

  @Get()
  @Permissions('stores:read')
  get(@Tenant() t: TenantContext, @Query('storeId') storeId: string): Promise<unknown> {
    return this.commerce.shopability.get(t, storeId);
  }

  @Put()
  @Permissions('stores:write')
  update(
    @Tenant() t: TenantContext,
    @Body() body: { storeId: string; enabled?: boolean; enabledChannels?: AgentChannel[]; agentNote?: string | null },
  ): Promise<unknown> {
    return this.commerce.shopability.update(t, body.storeId, body);
  }

  @Put('channel')
  @Permissions('stores:write')
  setChannel(
    @Tenant() t: TenantContext,
    @Body() body: { storeId: string; channel: AgentChannel; enabled: boolean },
  ): Promise<unknown> {
    return this.commerce.shopability.setChannel(t, body.storeId, body.channel, body.enabled);
  }
}
