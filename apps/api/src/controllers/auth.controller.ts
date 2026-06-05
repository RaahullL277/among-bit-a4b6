import { Body, Controller, Get, Post } from '@nestjs/common';
import { getCommerce, type TenantContext } from '@acp/core';
import { Public } from '../common/public.decorator.js';
import { Tenant } from '../common/tenant.decorator.js';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Passwordless auth. The magic-link / invite emails are delivered by the
 * notification layer in production; in dev the link is logged and returned as
 * `devLink` so the flow can be completed without a real inbox.
 */
@Controller('auth')
export class AuthController {
  private readonly commerce = getCommerce();

  private devLink(path: string, token: string) {
    const base = process.env.APP_URL ?? 'http://localhost:5173';
    const link = `${base}${path}?token=${token}`;
    // eslint-disable-next-line no-console
    console.log(`[auth] magic link: ${link}`);
    return isDev ? { devLink: link } : {};
  }

  @Public()
  @Post('request-link')
  async requestLink(@Body() body: { email: string }) {
    const { token } = await this.commerce.auth.requestMagicLink(body.email);
    return { sent: true, ...this.devLink('/login/verify', token) };
  }

  @Public()
  @Post('verify')
  verify(@Body() body: { token: string }) {
    return this.commerce.auth.verifyMagicLink(body.token);
  }

  @Public()
  @Post('signup')
  signup(@Body() body: { email: string; name?: string; tenantName: string }) {
    return this.commerce.auth.signup(body);
  }

  @Public()
  @Post('accept-invite')
  acceptInvite(@Body() body: { token: string; name?: string }) {
    return this.commerce.auth.acceptInvite(body.token, body.name);
  }

  @Get('me')
  me(@Tenant() t: TenantContext) {
    return this.commerce.auth.me(t);
  }

  @Post('logout')
  async logout(@Body() body: { token?: string }) {
    if (body.token) await this.commerce.auth.logout(body.token);
    return { ok: true };
  }
}
