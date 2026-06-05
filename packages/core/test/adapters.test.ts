import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getMessagingProvider, getPaymentProvider } from '../src/adapters/registry.js';

describe('payment adapters (stub)', () => {
  it('creates an order and returns a provider reference + checkout payload', async () => {
    const rzp = getPaymentProvider('RAZORPAY', { webhookSecret: 's' });
    const res = await rzp.createOrder({ orderId: 'o1', amountMinor: 24900, currency: 'INR' });
    expect(res.providerRef).toMatch(/^razorpay_/);
    expect(res.checkout.hostedCheckoutUrl).toContain(res.providerRef);
  });

  it('verifies a correct HMAC webhook signature and rejects a bad one', () => {
    const secret = 'whsec_123';
    const gokwik = getPaymentProvider('GOKWIK', { webhookSecret: secret });
    const body = JSON.stringify({ event: 'payment.captured', providerRef: 'gokwik_x', status: 'CAPTURED' });
    const sig = createHmac('sha256', secret).update(body).digest('hex');

    expect(gokwik.verifyWebhookSignature(body, sig)).toBe(true);
    expect(gokwik.verifyWebhookSignature(body, 'deadbeef')).toBe(false);
    expect(gokwik.verifyWebhookSignature(body, undefined)).toBe(false);
    expect(gokwik.parseWebhook(body)).toEqual({
      eventType: 'payment.captured',
      providerRef: 'gokwik_x',
      status: 'CAPTURED',
    });
  });
});

describe('messaging adapter (stub)', () => {
  it('records sent messages in its outbox', async () => {
    const wa = getMessagingProvider('WHATSAPP', {});
    const r = await wa.sendMessage({ to: '+91900', body: 'hi' });
    expect(r.status).toBe('SENT');
    expect(r.messageId).toMatch(/^wamid_/);
  });
});
