import { randomUUID } from 'node:crypto';
import type { ProviderName } from '@prisma/client';
import type { ProviderCredentials } from './payment.js';

/**
 * Provider-agnostic messaging interface for WhatsApp sales & support automation.
 * The stub records sent messages in-memory so flows are observable in tests.
 */
export interface MessagingProvider {
  readonly name: ProviderName;

  /** Send a free-form text message to a customer. */
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;

  /** Send a pre-approved template message (order updates, shipping, etc.). */
  sendTemplate(input: SendTemplateInput): Promise<SendMessageResult>;

  /** Parse an inbound webhook (customer reply) into a normalized message. */
  parseInbound(rawBody: string): InboundMessage;
}

export interface SendMessageInput {
  to: string;
  body: string;
}

export interface SendTemplateInput {
  to: string;
  template: string;
  variables?: Record<string, string>;
}

export interface SendMessageResult {
  messageId: string;
  to: string;
  status: 'SENT' | 'FAILED';
}

export interface InboundMessage {
  from: string;
  body: string;
  receivedAt: string;
}

export class WhatsAppAdapter implements MessagingProvider {
  readonly name = 'WHATSAPP' as ProviderName;
  /** In-memory outbox so the stub's effects are inspectable in tests/seed. */
  readonly outbox: SendMessageResult[] = [];

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_creds: ProviderCredentials) {}

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const result: SendMessageResult = {
      messageId: `wamid_${randomUUID()}`,
      to: input.to,
      status: 'SENT',
    };
    this.outbox.push(result);
    return result;
  }

  async sendTemplate(input: SendTemplateInput): Promise<SendMessageResult> {
    const result: SendMessageResult = {
      messageId: `wamid_${randomUUID()}`,
      to: input.to,
      status: 'SENT',
    };
    this.outbox.push(result);
    return result;
  }

  parseInbound(rawBody: string): InboundMessage {
    const body = JSON.parse(rawBody) as { from?: string; body?: string };
    return {
      from: body.from ?? 'unknown',
      body: body.body ?? '',
      receivedAt: new Date().toISOString(),
    };
  }
}
