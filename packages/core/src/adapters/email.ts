import { randomUUID } from 'node:crypto';
import type { ProviderName } from '@prisma/client';
import type { ProviderCredentials } from './payment.js';

/**
 * Provider-agnostic transactional email interface. The stub records sent mail
 * in an in-memory outbox so flows are observable in tests, mirroring the
 * WhatsApp adapter. Real providers (Resend/SES/SMTP) slot in behind this.
 */
export interface EmailProvider {
  readonly name: ProviderName;
  send(input: SendEmailInput): Promise<EmailResult>;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
  /** Optional sender override; defaults to the configured from-address. */
  from?: string;
}

export interface EmailResult {
  messageId: string;
  to: string;
  status: 'SENT' | 'FAILED';
}

export class ResendAdapter implements EmailProvider {
  readonly name = 'RESEND' as ProviderName;
  readonly outbox: (EmailResult & { subject: string })[] = [];

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_creds: ProviderCredentials) {}

  async send(input: SendEmailInput): Promise<EmailResult> {
    const result: EmailResult = {
      messageId: `email_${randomUUID()}`,
      to: input.to,
      status: 'SENT',
    };
    this.outbox.push({ ...result, subject: input.subject });
    return result;
  }
}
