import { randomUUID } from 'node:crypto';
import type { ProviderName } from '@prisma/client';
import type { ProviderCredentials } from './payment.js';

/**
 * Marketing-email / CRM sync interface (Klaviyo, Mailchimp, Brevo/Sendinblue).
 * Used to push customers and commerce events to a merchant's marketing platform
 * for campaigns, flows, and lists. v1 ships deterministic stubs with in-memory
 * outboxes; real REST implementations slot in behind the same interface.
 */
export interface MarketingEmailProvider {
  readonly name: ProviderName;
  /** Create or update a contact/subscriber. */
  upsertContact(input: UpsertContactInput): Promise<MarketingResult>;
  /** Record a behavioral event for a contact (e.g. "Placed Order"). */
  trackEvent(input: TrackEventInput): Promise<MarketingResult>;
}

export interface UpsertContactInput {
  email: string;
  name?: string;
  phone?: string;
  attributes?: Record<string, unknown>;
  /** Optional list/audience the contact should belong to. */
  listId?: string;
}

export interface TrackEventInput {
  email: string;
  event: string;
  properties?: Record<string, unknown>;
}

export interface MarketingResult {
  provider: ProviderName;
  ref: string;
  status: 'OK' | 'FAILED';
}

abstract class StubMarketingProvider implements MarketingEmailProvider {
  abstract readonly name: ProviderName;
  readonly contacts: UpsertContactInput[] = [];
  readonly events: TrackEventInput[] = [];

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_creds: ProviderCredentials) {}

  async upsertContact(input: UpsertContactInput): Promise<MarketingResult> {
    this.contacts.push(input);
    return { provider: this.name, ref: `contact_${randomUUID()}`, status: 'OK' };
  }

  async trackEvent(input: TrackEventInput): Promise<MarketingResult> {
    this.events.push(input);
    return { provider: this.name, ref: `event_${randomUUID()}`, status: 'OK' };
  }
}

export class KlaviyoAdapter extends StubMarketingProvider {
  readonly name = 'KLAVIYO' as ProviderName;
}
export class MailchimpAdapter extends StubMarketingProvider {
  readonly name = 'MAILCHIMP' as ProviderName;
}
export class BrevoAdapter extends StubMarketingProvider {
  readonly name = 'BREVO' as ProviderName;
}
