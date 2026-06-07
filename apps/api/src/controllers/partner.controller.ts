import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
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

  // --- Google / Apple OAuth (sign-in for existing partners only) ------------
  @PartnerPublic()
  @Post('auth/oauth')
  oauth(@Body() body: { provider: 'GOOGLE' | 'APPLE'; idToken: string }) {
    return this.commerce.partnerAuth.oauthLogin(body);
  }

  // --- Two-factor (TOTP) ----------------------------------------------------
  @PartnerPublic()
  @Post('auth/2fa/verify')
  verifyTwoFactor(@Body() body: { challengeToken: string; code: string }) {
    return this.commerce.partnerAuth.verifyTwoFactor(body.challengeToken, body.code);
  }

  @Post('auth/2fa/setup')
  setupTwoFactor(@Partner() p: PartnerContext): Promise<unknown> {
    return this.commerce.partnerAuth.setupTwoFactor(p);
  }

  @Post('auth/2fa/enable')
  enableTwoFactor(@Partner() p: PartnerContext, @Body() body: { code: string }) {
    return this.commerce.partnerAuth.enableTwoFactor(p, body.code);
  }

  @Post('auth/2fa/disable')
  disableTwoFactor(@Partner() p: PartnerContext, @Body() body: { code: string }) {
    return this.commerce.partnerAuth.disableTwoFactor(p, body.code);
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

  // --- Self-serve client management -----------------------------------------
  @Post('clients')
  createClient(
    @Partner() p: PartnerContext,
    @Body() body: { businessName: string; ownerEmail: string; ownerName?: string; monthlyFeeMinor?: number; renewsAt?: string },
  ): Promise<any> {
    return this.commerce.partners.createClientForPartner(p.partnerId, body);
  }

  @Patch('clients/:clientId')
  updateClient(
    @Partner() p: PartnerContext,
    @Param('clientId') clientId: string,
    @Body() body: { monthlyFeeMinor?: number; renewsAt?: string | null },
  ): Promise<any> {
    return this.commerce.partners.updateClientForPartner(p.partnerId, clientId, body);
  }

  @Delete('clients/:clientId')
  removeClient(@Partner() p: PartnerContext, @Param('clientId') clientId: string): Promise<any> {
    return this.commerce.partners.removeClient(p.partnerId, clientId);
  }
}
