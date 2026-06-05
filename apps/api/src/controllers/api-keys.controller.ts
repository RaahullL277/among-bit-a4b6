import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { getCommerce, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

@Controller('api-keys')
@Permissions('apikeys:manage')
export class ApiKeysController {
  private readonly commerce = getCommerce();

  /** Returns the raw secret exactly once. */
  @Post()
  create(@Tenant() t: TenantContext, @Body() body: { name: string; scopes?: string[] }) {
    return this.commerce.apiKeys.create(t, body);
  }

  @Get()
  list(@Tenant() t: TenantContext) {
    return this.commerce.apiKeys.list(t);
  }

  @Delete(':id')
  async revoke(@Tenant() t: TenantContext, @Param('id') id: string) {
    await this.commerce.apiKeys.revoke(t, id);
    return { revoked: true };
  }
}
