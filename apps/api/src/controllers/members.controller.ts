import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { getCommerce, type Role, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

const isDev = process.env.NODE_ENV !== 'production';

/** Team management. Every route requires the `members:manage` permission. */
@Controller()
@Permissions('members:manage')
export class MembersController {
  private readonly commerce = getCommerce();

  @Get('members')
  listMembers(@Tenant() t: TenantContext) {
    return this.commerce.members.listMembers(t);
  }

  @Patch('members/:userId')
  changeRole(@Tenant() t: TenantContext, @Param('userId') userId: string, @Body() body: { role: Role }) {
    return this.commerce.members.changeRole(t, userId, body.role);
  }

  @Delete('members/:userId')
  removeMember(@Tenant() t: TenantContext, @Param('userId') userId: string) {
    return this.commerce.members.removeMember(t, userId);
  }

  @Get('invites')
  listInvites(@Tenant() t: TenantContext) {
    return this.commerce.members.listInvites(t);
  }

  @Post('invites')
  async createInvite(@Tenant() t: TenantContext, @Body() body: { email: string; role: Role }) {
    const { invite, token } = await this.commerce.members.createInvite(t, body);
    const base = process.env.APP_URL ?? 'http://localhost:5173';
    const link = `${base}/invite/accept?token=${token}`;
    // eslint-disable-next-line no-console
    console.log(`[auth] invite link for ${invite.email}: ${link}`);
    return { invite, ...(isDev ? { devLink: link } : {}) };
  }

  @Delete('invites/:id')
  revokeInvite(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.commerce.members.revokeInvite(t, id);
  }
}
