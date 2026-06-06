import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { getCommerce, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

/**
 * Merchant-facing app marketplace: browse the catalog and manage installs. The
 * catalog itself is operator-curated (see PlatformController.publishApp).
 */
@Controller('apps')
export class AppsController {
  private readonly commerce = getCommerce();

  @Get('catalog')
  @Permissions('stores:read')
  catalog(): Promise<unknown> {
    return this.commerce.apps.catalog();
  }

  @Get('installed')
  @Permissions('stores:read')
  installed(@Tenant() t: TenantContext): Promise<unknown> {
    return this.commerce.apps.listInstalled(t);
  }

  @Post(':id/install')
  @Permissions('integrations:write')
  install(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: { config?: Record<string, unknown> }): Promise<unknown> {
    return this.commerce.apps.install(t, id, body?.config);
  }

  @Patch(':id')
  @Permissions('integrations:write')
  setEnabled(@Tenant() t: TenantContext, @Param('id') id: string, @Body() body: { enabled: boolean }): Promise<unknown> {
    return this.commerce.apps.setEnabled(t, id, Boolean(body?.enabled));
  }

  @Delete(':id/install')
  @Permissions('integrations:write')
  uninstall(@Tenant() t: TenantContext, @Param('id') id: string): Promise<unknown> {
    return this.commerce.apps.uninstall(t, id);
  }
}
