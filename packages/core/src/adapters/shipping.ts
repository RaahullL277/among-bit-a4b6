import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/** Constant-time hex-string compare (guards the length-mismatch throw). */
function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
import type { ProviderName, ShipmentStatus } from '@prisma/client';
import type { ProviderCredentials } from './payment.js';

export interface Address {
  name?: string;
  phone?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
}

export interface CreateShipmentInput {
  orderId: string;
  to: Address;
  from?: Address;
  weightGrams?: number;
  codAmountMinor?: number;
}

export interface ShipmentResult {
  awb: string;
  courier: string;
  status: ShipmentStatus;
  trackingUrl: string;
  labelUrl?: string;
}

export interface ShippingWebhookEvent {
  awb?: string;
  status?: ShipmentStatus;
  description?: string;
  location?: string;
}

/**
 * Provider-agnostic shipping/logistics interface. Delhivery implements this;
 * call sites only touch the interface so a real integration drops in later.
 */
export interface ShippingProvider {
  readonly name: ProviderName;
  createShipment(input: CreateShipmentInput): Promise<ShipmentResult>;
  cancel(awb: string): Promise<{ cancelled: boolean }>;
  verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean;
  parseWebhook(rawBody: string): ShippingWebhookEvent;
}

/**
 * Deterministic, network-free stub. Mirrors a real adapter's shape, including
 * AWB assignment and HMAC webhook verification, so the full flow is testable.
 */
export class DelhiveryAdapter implements ShippingProvider {
  readonly name = 'DELHIVERY' as ProviderName;
  private readonly webhookSecret: string;

  constructor(creds: ProviderCredentials) {
    this.webhookSecret = (creds.webhookSecret as string) ?? 'stub_shipping_secret';
  }

  async createShipment(input: CreateShipmentInput): Promise<ShipmentResult> {
    const awb = `DL${randomInt(10_000_000, 99_999_999)}`;
    return {
      awb,
      courier: 'Delhivery',
      status: 'MANIFESTED',
      trackingUrl: `https://track.stub.local/${awb}`,
      labelUrl: `https://label.stub.local/${awb}.pdf`,
    };
  }

  async cancel(): Promise<{ cancelled: boolean }> {
    return { cancelled: true };
  }

  verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
    if (!signature) return false;
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    return safeEqualHex(signature, expected);
  }

  parseWebhook(rawBody: string): ShippingWebhookEvent {
    const body = JSON.parse(rawBody) as ShippingWebhookEvent & { _id?: string };
    return { awb: body.awb, status: body.status, description: body.description, location: body.location };
  }
}
