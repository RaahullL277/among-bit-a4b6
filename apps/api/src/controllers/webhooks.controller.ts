import { Controller, Headers, Param, Post, Req } from '@nestjs/common';
import { getCommerce, type ProviderName } from '@acp/core';
import { Public } from '../common/public.decorator.js';

/**
 * Inbound provider webhooks. Public (no API key): authenticity comes from the
 * provider signature, verified inside the service layer against the owning
 * store's credentials. Requires the raw request body (app is created with
 * `rawBody: true`) so the HMAC matches byte-for-byte.
 */
@Controller('webhooks')
export class WebhooksController {
  private readonly commerce = getCommerce();

  @Public()
  @Post(':provider')
  async handle(
    @Param('provider') provider: string,
    @Headers('x-webhook-signature') signature: string | undefined,
    @Req() req: any,
  ) {
    const rawBody: string = req.rawBody
      ? req.rawBody.toString('utf8')
      : JSON.stringify(req.body ?? {});
    const providerName = provider.toUpperCase() as ProviderName;
    return this.commerce.payments.handleWebhook(providerName, rawBody, signature);
  }
}
