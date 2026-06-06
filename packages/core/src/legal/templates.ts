import type { LegalPolicyType } from '@prisma/client';

/** Everything a legal template needs, gathered from the store + return policy. */
export interface LegalContext {
  storeName: string;
  legalName?: string | null;
  gstin?: string | null;
  address?: string | null; // single-line registered address
  supportEmail?: string | null;
  supportPhone?: string | null;
  website?: string | null;
  country: string;
  // From the return policy, so the refund/shipping docs stay consistent.
  returnWindowDays: number;
  restockingFeePercent: number;
  cancelWindowHours: number;
}

const today = () => new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });

function sellerLine(c: LegalContext): string {
  const name = c.legalName || c.storeName;
  const bits = [name];
  if (c.gstin) bits.push(`(GSTIN ${c.gstin})`);
  if (c.address) bits.push(`, ${c.address}`);
  return bits.join(' ');
}

function contactLine(c: LegalContext): string {
  const parts: string[] = [];
  if (c.supportEmail) parts.push(`email **${c.supportEmail}**`);
  if (c.supportPhone) parts.push(`phone **${c.supportPhone}**`);
  return parts.length ? parts.join(' or ') : 'the contact details on our store';
}

const TITLES: Record<LegalPolicyType, string> = {
  TERMS: 'Terms of Use',
  PRIVACY: 'Privacy Policy',
  SHIPPING: 'Shipping & Delivery Policy',
  REFUND: 'Return, Refund & Cancellation Policy',
  COOKIES: 'Cookie Policy',
};

export function legalTitle(type: LegalPolicyType): string {
  return TITLES[type];
}

/**
 * Build a sensible, India/GST-aware default policy from the store context. These
 * are starting templates the merchant should review with counsel — every doc
 * carries that disclaimer.
 */
export function renderLegalTemplate(type: LegalPolicyType, c: LegalContext): { title: string; body: string } {
  const seller = sellerLine(c);
  const contact = contactLine(c);
  const disclaimer = `\n\n---\n_This document was generated as a starting template on ${today()} and should be reviewed by the store owner (and, where appropriate, a legal professional) before being relied upon._`;

  let body: string;
  switch (type) {
    case 'TERMS':
      body = `# Terms of Use

_Last updated: ${today()}_

These Terms of Use govern your access to and use of the online store operated by ${seller} ("we", "us", "our"). By browsing, placing an order, or otherwise using the store, you agree to these terms.

## 1. Eligibility
You must be capable of forming a legally binding contract under the Indian Contract Act, 1872 to place an order.

## 2. Products & pricing
All prices are listed in your local store currency and are inclusive of taxes where indicated. We may correct pricing errors and update product information at any time.

## 3. Orders & acceptance
Your order is an offer to buy. We may accept or decline it, and we will confirm acceptance by email. Payment is processed by our payment partners; we do not store your card details.

## 4. Shipping, returns & refunds
Delivery, returns, refunds and cancellations are governed by our Shipping Policy and our Return, Refund & Cancellation Policy, which form part of these terms.

## 5. Acceptable use
You agree not to misuse the store, attempt to disrupt it, or infringe our or others' intellectual-property rights.

## 6. Limitation of liability
To the extent permitted by law, our liability for any claim arising from your use of the store is limited to the value of the order giving rise to the claim.

## 7. Governing law
These terms are governed by the laws of India, and the courts at our registered place of business have exclusive jurisdiction.

## 8. Contact
For any questions about these terms, contact us at ${contact}.${disclaimer}`;
      break;

    case 'PRIVACY':
      body = `# Privacy Policy

_Last updated: ${today()}_

${seller} ("we", "us", "our") respects your privacy. This policy explains what personal data we collect, why, and your rights, consistent with India's Digital Personal Data Protection Act, 2023.

## 1. Data we collect
- **Contact & order data:** name, email, phone, billing/shipping address.
- **Transaction data:** items purchased, order value, invoices.
- **Usage data:** pages viewed and actions taken on the store (for analytics and improving the experience).

## 2. Why we use it
To process and deliver orders, provide support, issue GST invoices, prevent fraud, and — only with your consent — send marketing messages.

## 3. Sharing
We share data only with the service providers needed to run the store (payment, shipping, messaging, email/SMS) and where required by law. We do not sell your personal data.

## 4. Marketing consent
Promotional messages are sent only if you opt in. You can withdraw consent or unsubscribe at any time; transactional notices (order updates, invoices) are unaffected.

## 5. Retention
We keep order and tax records for as long as required by law (including GST record-keeping), and other data only as long as needed for the purposes above.

## 6. Your rights
You may request access to, correction of, or deletion of your personal data, and may withdraw consent, by contacting us at ${contact}.

## 7. Security
We use reasonable technical and organisational measures to protect your data, including encryption of stored credentials.

## 8. Contact / Grievance
For privacy questions or grievances, contact us at ${contact}.${disclaimer}`;
      break;

    case 'SHIPPING':
      body = `# Shipping & Delivery Policy

_Last updated: ${today()}_

This policy explains how ${seller} ships and delivers orders.

## 1. Processing time
Orders are typically processed within 1–3 business days of payment confirmation.

## 2. Delivery time & charges
Delivery timelines and any shipping charges are shown at checkout before you pay. Timelines are estimates and may vary with location and courier.

## 3. Tracking
Once your order ships, we share tracking details by email/SMS. You can also track it from the order-tracking page on our store.

## 4. Delays
We are not liable for delays caused by couriers, weather, or events beyond our control, but we will help resolve any issue — contact us at ${contact}.

## 5. Incorrect address / failed delivery
Please ensure your delivery address is accurate. Orders returned to us due to an incorrect address or repeated failed delivery may incur re-shipping charges.${disclaimer}`;
      break;

    case 'REFUND':
      body = `# Return, Refund & Cancellation Policy

_Last updated: ${today()}_

This policy explains returns, refunds and cancellations for orders placed with ${seller}.

## 1. Return window
You may request a return within **${c.returnWindowDays} day(s)** of delivery, for eligible reasons (e.g. damaged, wrong item, not as described).

## 2. Cancellations
You can cancel an order within **${c.cancelWindowHours} hour(s)** of placing it, provided it has not yet shipped. A paid order cancelled in time is refunded automatically.

## 3. Refunds
Approved refunds are issued to your original payment method.${c.restockingFeePercent > 0 ? ` A restocking fee of **${c.restockingFeePercent}%** may be deducted where applicable.` : ''} Where a GST tax invoice was issued, a credit note is raised reversing the applicable tax.

## 4. How to request
Start a return or cancellation from the order-tracking page on our store (you'll need your order number and email), or contact us at ${contact}.

## 5. Non-returnable items
Certain items (e.g. perishable, personal-care, or made-to-order goods) may not be eligible for return; this is indicated on the product where applicable.${disclaimer}`;
      break;

    case 'COOKIES':
      body = `# Cookie Policy

_Last updated: ${today()}_

This policy explains how the online store operated by ${seller} uses cookies and similar technologies.

## 1. What cookies we use
- **Essential cookies:** required for the cart, checkout and security.
- **Analytics cookies:** help us understand how the store is used so we can improve it.
- **Marketing cookies:** used, only with your consent, to personalise offers.

## 2. Managing cookies
You can control or delete cookies through your browser settings. Disabling essential cookies may affect checkout and other core features.

## 3. Contact
For questions about this policy, contact us at ${contact}.${disclaimer}`;
      break;

    default:
      body = '';
  }

  return { title: TITLES[type], body };
}
