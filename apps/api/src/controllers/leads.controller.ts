import { Body, Controller, Post } from '@nestjs/common';
import { getCommerce } from '@acp/core';
import { Public } from '../common/public.decorator.js';

/**
 * Public lead capture for the marketing landing pages (ecom.imagine.bo /
 * ecompartner.imagine.bo). The "start building your store" bar posts the
 * prospect's prompt + imported file manifest here; no auth, no tenant yet.
 */
@Controller('leads')
@Public()
export class LeadsController {
  private readonly commerce = getCommerce();

  @Post('store-build')
  submit(@Body() body: any) {
    return this.commerce.leads.submit({
      source: body?.source,
      email: body?.email,
      prompt: body?.prompt,
      businessName: body?.businessName,
      assets: body?.assets,
      referrer: body?.referrer,
    });
  }
}
