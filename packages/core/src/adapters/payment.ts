import { createHmac, randomUUID } from 'node:crypto';
import type { ProviderName } from '@prisma/client';

/**
 * Provider-agnostic payment interface. Razorpay and GoKwik both implement this;
 * call sites only ever touch the interface, so swapping a stub for a real
 * integration later requires no changes outside this folder.
 */
export interface PaymentProvider {
  readonly name: ProviderName;

  /** Create a payment order with the provider and return its reference. */
  createOrder(input: CreatePaymentOrderInput): Promise<PaymentOrderResult>;

  /** Capture/confirm an authorized payment. */
  capturePayment(providerRef: string, amountMinor: number): Promise<PaymentCaptureResult>;

  /** Refund a captured payment (full or partial). */
  refund(providerRef: string, amountMinor: number): Promise<PaymentRefundResult>;

  /** Verify the signature on an inbound webhook payload. */
  verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean;

  /** Parse a verified webhook body into a normalized event. */
  parseWebhook(rawBody: string): PaymentWebhookEvent;
}

export interface CreatePaymentOrderInput {
  orderId: string;
  amountMinor: number;
  currency: string;
  customer?: { name?: string; email?: string; phone?: string };
}

export interface PaymentOrderResult {
  providerRef: string;
  /** Opaque data the storefront/checkout uses to complete payment. */
  checkout: Record<string, unknown>;
}

export interface PaymentCaptureResult {
  providerRef: string;
  status: 'CAPTURED' | 'FAILED';
}

export interface PaymentRefundResult {
  refundRef: string;
  status: 'REFUNDED' | 'FAILED';
}

export interface PaymentWebhookEvent {
  eventType: string;
  providerRef?: string;
  status?: 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'REFUNDED';
}

/** Credentials/config decrypted from IntegrationConfig and handed to an adapter. */
export interface ProviderCredentials {
  [key: string]: unknown;
  webhookSecret?: string;
}

// ---------------------------------------------------------------------------
// Stub implementations
//
// These are deterministic, network-free fakes so the full checkout → webhook →
// order flow is exercisable in Milestone 1 without live credentials. They keep
// the exact shape a real adapter would, including HMAC webhook verification.
// ---------------------------------------------------------------------------

abstract class StubPaymentProvider implements PaymentProvider {
  abstract readonly name: ProviderName;
  protected readonly webhookSecret: string;

  constructor(creds: ProviderCredentials) {
    this.webhookSecret = creds.webhookSecret ?? 'stub_webhook_secret';
  }

  async createOrder(input: CreatePaymentOrderInput): Promise<PaymentOrderResult> {
    const providerRef = `${this.name.toLowerCase()}_${randomUUID()}`;
    return {
      providerRef,
      checkout: {
        provider: this.name,
        providerRef,
        amountMinor: input.amountMinor,
        currency: input.currency,
        // A real adapter returns a hosted-checkout URL / SDK order id here.
        hostedCheckoutUrl: `https://pay.stub.local/${providerRef}`,
      },
    };
  }

  async capturePayment(providerRef: string): Promise<PaymentCaptureResult> {
    return { providerRef, status: 'CAPTURED' };
  }

  async refund(providerRef: string): Promise<PaymentRefundResult> {
    return { refundRef: `rfnd_${randomUUID()}`, status: 'REFUNDED' };
  }

  verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
    if (!signature) return false;
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    return signature === expected;
  }

  parseWebhook(rawBody: string): PaymentWebhookEvent {
    const body = JSON.parse(rawBody) as {
      event?: string;
      providerRef?: string;
      status?: PaymentWebhookEvent['status'];
    };
    return {
      eventType: body.event ?? 'payment.unknown',
      providerRef: body.providerRef,
      status: body.status,
    };
  }
}

export class RazorpayAdapter extends StubPaymentProvider {
  readonly name = 'RAZORPAY' as ProviderName;
}

export class GoKwikAdapter extends StubPaymentProvider {
  readonly name = 'GOKWIK' as ProviderName;
}
