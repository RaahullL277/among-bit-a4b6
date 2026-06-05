import type { NotificationChannel, NotificationEvent, RecipientType } from '@prisma/client';

/**
 * Built-in defaults so notifications work without any seeding. Per-store rows
 * (NotificationTemplate / NotificationPreference) override these when present.
 */

export interface TemplateDef {
  subject?: string;
  body: string;
}

type ChannelTemplates = Partial<Record<NotificationChannel, TemplateDef>>;

// Placeholders use {{var}} and are filled from the `data` passed to notify().
export const DEFAULT_TEMPLATES: Record<NotificationEvent, ChannelTemplates> = {
  ORDER_PLACED: {
    EMAIL: {
      subject: 'Your {{storeName}} order #{{orderNumber}} is confirmed',
      body: 'Hi {{customerName}}, thanks for your order #{{orderNumber}} ({{total}}). We\'ll let you know when it ships.',
    },
    SMS: { body: '{{storeName}}: order #{{orderNumber}} confirmed ({{total}}).' },
    WHATSAPP: { body: 'Thanks {{customerName}}! Order #{{orderNumber}} ({{total}}) is confirmed. 🛍️' },
  },
  ORDER_PAID: {
    EMAIL: {
      subject: 'Payment received for order #{{orderNumber}}',
      body: 'We\'ve received your payment of {{total}} for order #{{orderNumber}}. Thank you!',
    },
    WHATSAPP: { body: 'Payment of {{total}} received for order #{{orderNumber}}. ✅' },
  },
  ORDER_STATUS_CHANGED: {
    EMAIL: {
      subject: 'Order #{{orderNumber}} is now {{status}}',
      body: 'Your order #{{orderNumber}} status has changed to {{status}}.',
    },
    WHATSAPP: { body: 'Update: order #{{orderNumber}} is now {{status}}.' },
  },
  ABANDONED_CART: {
    EMAIL: {
      subject: 'You left items in your {{storeName}} cart',
      body: 'Hi {{customerName}}, your cart is waiting. Complete your purchase: {{cartUrl}}',
    },
    WHATSAPP: { body: 'Still interested? Your {{storeName}} cart is saved: {{cartUrl}}' },
  },
  LOW_STOCK: {
    EMAIL: {
      subject: '[Low stock] {{productTitle}} at {{storeName}}',
      body: '{{productTitle}} is running low ({{inventory}} left, ~{{daysOfCover}} days of cover).',
    },
  },
  OUT_OF_STOCK: {
    EMAIL: {
      subject: '[Out of stock] {{productTitle}} at {{storeName}}',
      body: '{{productTitle}} is out of stock. Restock to keep selling.',
    },
  },
  SHIPMENT_CREATED: {
    EMAIL: {
      subject: 'Your {{storeName}} order #{{orderNumber}} has shipped',
      body: 'Good news! Order #{{orderNumber}} is on its way via {{courier}}. Track it: {{trackingUrl}} (AWB {{awb}})',
    },
    SMS: { body: '{{storeName}}: order #{{orderNumber}} shipped. Track {{trackingUrl}}' },
    WHATSAPP: { body: '📦 Order #{{orderNumber}} shipped via {{courier}}. Track: {{trackingUrl}}' },
  },
  OUT_FOR_DELIVERY: {
    EMAIL: {
      subject: 'Order #{{orderNumber}} is out for delivery',
      body: 'Your order #{{orderNumber}} is out for delivery today.',
    },
    WHATSAPP: { body: '🚚 Order #{{orderNumber}} is out for delivery today!' },
  },
  DELIVERED: {
    EMAIL: {
      subject: 'Order #{{orderNumber}} delivered',
      body: 'Your order #{{orderNumber}} has been delivered. Enjoy!',
    },
    WHATSAPP: { body: '✅ Order #{{orderNumber}} delivered. Thanks for shopping with {{storeName}}!' },
  },
};

type RecipientChannels = Partial<Record<RecipientType, NotificationChannel[]>>;

// Which channels fire for each (event, recipient) when no preference row exists.
export const DEFAULT_PREFERENCES: Record<NotificationEvent, RecipientChannels> = {
  ORDER_PLACED: { CUSTOMER: ['EMAIL', 'WHATSAPP'], STORE_OWNER: ['EMAIL'] },
  ORDER_PAID: { CUSTOMER: ['EMAIL', 'WHATSAPP'], STORE_OWNER: ['EMAIL'] },
  ORDER_STATUS_CHANGED: { CUSTOMER: ['WHATSAPP'] },
  ABANDONED_CART: { CUSTOMER: ['EMAIL', 'WHATSAPP'] },
  LOW_STOCK: { STORE_OWNER: ['EMAIL'] },
  OUT_OF_STOCK: { STORE_OWNER: ['EMAIL'] },
  SHIPMENT_CREATED: { CUSTOMER: ['EMAIL', 'WHATSAPP'] },
  OUT_FOR_DELIVERY: { CUSTOMER: ['WHATSAPP'] },
  DELIVERED: { CUSTOMER: ['EMAIL', 'WHATSAPP'] },
};

/** Replace {{key}} tokens from `data`; unknown tokens become empty strings. */
export function renderTemplate(text: string, data: Record<string, unknown>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const value = data[key];
    return value === undefined || value === null ? '' : String(value);
  });
}
