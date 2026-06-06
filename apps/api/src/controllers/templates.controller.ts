import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { getCommerce, type StoreCategory, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

/** Store design templates (theme + storefront layout) per vertical. */
@Controller('templates')
export class TemplatesController {
  private readonly commerce = getCommerce();

  @Get()
  @Permissions('products:read')
  list(@Query('category') category?: StoreCategory): any {
    return this.commerce.templates.list(category);
  }

  @Post('apply')
  @Permissions('products:write')
  apply(@Tenant() t: TenantContext, @Body() body: { storeId: string; templateId: string; publish?: boolean }): Promise<any> {
    return this.commerce.templates.apply(t, body.storeId, body.templateId, { publish: body.publish });
  }
}
