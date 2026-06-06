import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { getCommerce } from '@acp/core';
import { Public } from '../common/public.decorator.js';

/**
 * Public agent-commerce surface consumed by external AI shopping assistants
 * (Claude, ChatGPT, Gemini, …). The assistant identifies itself via `?channel=`
 * or the `x-agent-channel` header. Every shopping action is gated by the store's
 * shopability switch, so owners/partners can turn AI shopping on/off per assistant.
 */
@Controller('agent')
@Public()
export class AgentController {
  private readonly commerce = getCommerce();

  private channel(q?: string, h?: string): string | null {
    return q ?? h ?? null;
  }

  @Get(':storeId/manifest')
  manifest(
    @Param('storeId') storeId: string,
    @Query('channel') channel?: string,
    @Headers('x-agent-channel') header?: string,
  ): Promise<unknown> {
    return this.commerce.shopability.manifest(storeId, this.channel(channel, header));
  }

  @Get(':storeId/feed')
  feed(
    @Param('storeId') storeId: string,
    @Query('channel') channel?: string,
    @Headers('x-agent-channel') header?: string,
  ): Promise<unknown> {
    return this.commerce.shopability.feed(storeId, this.channel(channel, header));
  }

  @Post(':storeId/carts')
  createCart(
    @Param('storeId') storeId: string,
    @Body() body: any,
    @Query('channel') channel?: string,
    @Headers('x-agent-channel') header?: string,
  ): Promise<unknown> {
    return this.commerce.shopability.createCart(storeId, this.channel(channel, header), body ?? {});
  }

  @Post(':storeId/checkout')
  checkout(
    @Param('storeId') storeId: string,
    @Body() body: { cartId: string; email?: string; redeemPoints?: number; mandate?: { ref: string; maxAmountMinor: number; currency: string } },
    @Query('channel') channel?: string,
    @Headers('x-agent-channel') header?: string,
  ): Promise<unknown> {
    return this.commerce.shopability.checkout(storeId, this.channel(channel, header), body?.cartId, body);
  }
}
