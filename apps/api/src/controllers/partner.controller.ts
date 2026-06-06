import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { getCommerce, type PartnerContext } from '@acp/core';
import { Public } from '../common/public.decorator.js';
import { PartnerAuthGuard } from '../auth/partner-auth.guard.js';
import { Partner, PartnerPublic } from '../common/partner.decorator.js';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * The partner/agency portal: magic-link auth (separate plane) plus a dashboard
 * over the partner's own clients — analytics, commission earnings, and renewals.
 * @Public() skips the tenant guard; PartnerAuthGuard enforces the partner
 * session except where @PartnerPublic().
 */
@Controller('partner')
@Public()
@UseGuards(PartnerAuthGuard)
export class PartnerController {
  private readonly commerce = getCommerce();

  // --- Auth -----------------------------------------------------------------
  @PartnerPublic()
  @Post('auth/request-link')
  async requestLink(@Body() body: { email: string }) {
    const { token } = await this.commerce.partnerAuth.requestMagicLink(body.email);
    const base = process.env.PARTNER_URL ?? 'http://localhost:5176';
    return { sent: true, ...(isDev && token ? { devLink: `${base}/verify?token=${token}` } : {}) };
  }

  @PartnerPublic()
  @Post('auth/verify')
  verify(@Body() body: { token: string }) {
    return this.commerce.partnerAuth.verifyMagicLink(body.token);
  }

  @Get('auth/me')
  me(@Partner() p: PartnerContext) {
    return this.commerce.partnerAuth.me(p);
  }

  @Post('auth/logout')
  async logout(@Body() body: { token?: string }) {
    if (body.token) await this.commerce.partnerAuth.logout(body.token);
    return { ok: true };
  }

  // --- Dashboard (scoped to the authenticated partner) ----------------------
  @Get('dashboard')
  dashboard(@Partner() p: PartnerContext, @Query('from') from?: string): Promise<any> {
    return this.commerce.partners.dashboard(p.partnerId, from);
  }

  @Get('clients')
  clients(@Partner() p: PartnerContext, @Query('from') from?: string): Promise<any> {
    return this.commerce.partners.clients(p.partnerId, from);
  }

  @Get('renewals')
  renewals(@Partner() p: PartnerContext, @Query('withinDays') withinDays?: string): Promise<any> {
    return this.commerce.partners.renewals(p.partnerId, withinDays ? Number(withinDays) : 30);
  }
}
