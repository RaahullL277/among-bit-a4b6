import type { IntegrationKind, NotificationChannel, ProviderName } from '@prisma/client';
import {
  GoKwikAdapter,
  RazorpayAdapter,
  type PaymentProvider,
  type ProviderCredentials,
} from './payment.js';
import { WhatsAppAdapter, type MessagingProvider } from './messaging.js';
import { ResendAdapter, type EmailProvider } from './email.js';
import { Msg91Adapter, type SmsProvider } from './sms.js';

/**
 * Resolves a provider name + decrypted credentials into a concrete adapter.
 * This is the single place new providers are registered; nothing else in the
 * codebase needs to know which implementation backs a given store.
 */
export function getPaymentProvider(
  provider: ProviderName,
  creds: ProviderCredentials,
): PaymentProvider {
  switch (provider) {
    case 'RAZORPAY':
      return new RazorpayAdapter(creds);
    case 'GOKWIK':
      return new GoKwikAdapter(creds);
    default:
      throw new Error(`No payment adapter registered for provider: ${provider}`);
  }
}

export function getMessagingProvider(
  provider: ProviderName,
  creds: ProviderCredentials,
): MessagingProvider {
  switch (provider) {
    case 'WHATSAPP':
      return new WhatsAppAdapter(creds);
    default:
      throw new Error(`No messaging adapter registered for provider: ${provider}`);
  }
}

export function getEmailProvider(
  provider: ProviderName,
  creds: ProviderCredentials,
): EmailProvider {
  switch (provider) {
    case 'RESEND':
      return new ResendAdapter(creds);
    default:
      throw new Error(`No email adapter registered for provider: ${provider}`);
  }
}

export function getSmsProvider(provider: ProviderName, creds: ProviderCredentials): SmsProvider {
  switch (provider) {
    case 'MSG91':
      return new Msg91Adapter(creds);
    default:
      throw new Error(`No SMS adapter registered for provider: ${provider}`);
  }
}

export const PROVIDER_KIND: Record<ProviderName, IntegrationKind> = {
  RAZORPAY: 'PAYMENT',
  GOKWIK: 'PAYMENT',
  WHATSAPP: 'MESSAGING',
  RESEND: 'MESSAGING',
  MSG91: 'MESSAGING',
};

/** Each notification channel is backed by exactly one provider (today). */
export const CHANNEL_PROVIDER: Record<NotificationChannel, ProviderName> = {
  EMAIL: 'RESEND',
  SMS: 'MSG91',
  WHATSAPP: 'WHATSAPP',
};
