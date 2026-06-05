import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { getCommerce, type PlatformContext } from '@acp/core';
import { Public } from '../common/public.decorator.js';
import { PlatformAuthGuard } from '../auth/platform-auth.guard.js';
import { Platform, PlatformPublic } from '../common/platform.decorator.js';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Platform-operator authentication (separate plane from merchant auth).
 * @Public() bypasses the tenant guard; PlatformAuthGuard enforces the platform
 * session except where @PlatformPublic() (the login endpoints).
 */
@Controller('platform/auth')
@Public()
@UseGuards(PlatformAuthGuard)
export class PlatformAuthController {
  private readonly commerce = getCommerce();

  @PlatformPublic()
  @Post('request-link')
  async requestLink(@Body() body: { email: string }) {
    const { token } = await this.commerce.platformAuth.requestMagicLink(body.email);
    // Always report success; surface a dev link only when a token was issued.
    const base = process.env.PLATFORM_URL ?? 'http://localhost:5175';
    return { sent: true, ...(isDev && token ? { devLink: `${base}/verify?token=${token}` } : {}) };
  }

  @PlatformPublic()
  @Post('verify')
  verify(@Body() body: { token: string }) {
    return this.commerce.platformAuth.verifyMagicLink(body.token);
  }

  @Get('me')
  me(@Platform() p: PlatformContext) {
    return this.commerce.platformAuth.me(p);
  }

  @Post('logout')
  async logout(@Body() body: { token?: string }) {
    if (body.token) await this.commerce.platformAuth.logout(body.token);
    return { ok: true };
  }
}
