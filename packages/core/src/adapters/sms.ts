import { randomUUID } from 'node:crypto';
import type { ProviderName } from '@prisma/client';
import type { ProviderCredentials } from './payment.js';

/**
 * Provider-agnostic SMS interface. The stub records sent messages in an
 * in-memory outbox. A real India provider (e.g. MSG91) slots in behind this.
 */
export interface SmsProvider {
  readonly name: ProviderName;
  send(input: SendSmsInput): Promise<SmsResult>;
}

export interface SendSmsInput {
  to: string;
  body: string;
}

export interface SmsResult {
  messageId: string;
  to: string;
  status: 'SENT' | 'FAILED';
}

export class Msg91Adapter implements SmsProvider {
  readonly name = 'MSG91' as ProviderName;
  readonly outbox: SmsResult[] = [];

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_creds: ProviderCredentials) {}

  async send(input: SendSmsInput): Promise<SmsResult> {
    const result: SmsResult = {
      messageId: `sms_${randomUUID()}`,
      to: input.to,
      status: 'SENT',
    };
    this.outbox.push(result);
    return result;
  }
}
