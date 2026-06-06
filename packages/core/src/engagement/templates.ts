import type { EngagementTrigger, NotificationChannel } from '@prisma/client';

/**
 * The engagement template library: **5 ready-to-use variants per channel** for
 * every trigger. The hyper-personalisation agent fills the {{merge tags}} and
 * picks a variant per customer (biased by temperature, see engagement.service).
 *
 * Merge tags available to all templates:
 *   {{firstName}} {{storeName}} {{product}} {{product2}} {{price}} {{discount}}
 *   {{code}} {{stockLeft}} {{cohort}} {{festival}} {{recommended}} {{url}} {{cartUrl}}
 *
 * `tone` lets the personalisation agent steer copy by temperature:
 *   warm → friendly, value (re-engage gently); hot → premium, new, playful.
 */
export type Tone = 'friendly' | 'urgent' | 'premium' | 'playful' | 'value';

export interface EngTemplate {
  key: string; // `${trigger}:${channel}:${variant}`
  trigger: EngagementTrigger;
  channel: NotificationChannel;
  variant: number; // 1..5
  name: string;
  tone: Tone;
  subject?: string; // EMAIL only
  body: string;
}

// A compact authoring shape; we expand to keyed EngTemplate below.
interface Draft {
  name: string;
  tone: Tone;
  subject?: string;
  body: string;
}
type ChannelDrafts = Record<NotificationChannel, Draft[]>;

// Five distinct tones per channel keep the rotation feeling fresh while staying
// on-message. Copy is India-first (₹, festive context) and keeps merge tags.
const LIBRARY: Record<EngagementTrigger, ChannelDrafts> = {
  NEW_IN_STOCK: {
    EMAIL: [
      { name: 'Fresh drop', tone: 'friendly', subject: 'Just in at {{storeName}}: {{product}}', body: 'Hi {{firstName}}, we just added {{product}} ({{price}}) to {{storeName}}. Be among the first to grab it: {{url}}' },
      { name: 'Early access', tone: 'urgent', subject: 'New arrival — {{product}} (selling fast)', body: '{{firstName}}, {{product}} just landed and pieces move quickly. See it before it sells out: {{url}}' },
      { name: 'Curated for you', tone: 'premium', subject: 'A new arrival we think you’ll love', body: 'Hi {{firstName}}, based on your taste, our newest piece — {{product}} — feels right up your street. Take a look: {{url}}' },
      { name: 'Just landed', tone: 'playful', subject: 'Psst… {{product}} just walked in 👀', body: '{{firstName}}, the new {{product}} is here and it’s already turning heads. Say hello: {{url}}' },
      { name: 'New + favourites', tone: 'value', subject: 'New in — plus picks for you', body: 'Hi {{firstName}}, {{product}} just arrived at {{storeName}}. You might also like {{recommended}}. Shop new in: {{url}}' },
    ],
    SMS: [
      { name: 'Fresh drop', tone: 'friendly', body: '{{storeName}}: New in — {{product}} ({{price}}). Shop now {{url}}' },
      { name: 'Early access', tone: 'urgent', body: '{{firstName}}, {{product}} just dropped & moving fast. Grab yours {{url}}' },
      { name: 'Curated', tone: 'premium', body: 'Handpicked for you: {{product}} just arrived. {{url}}' },
      { name: 'Just landed', tone: 'playful', body: 'New in 👀 {{product}} is here. Take a peek {{url}}' },
      { name: 'New + picks', tone: 'value', body: 'New: {{product}}. Also for you: {{recommended}}. {{url}}' },
    ],
    WHATSAPP: [
      { name: 'Fresh drop', tone: 'friendly', body: 'Hi {{firstName}}! 🆕 {{product}} just arrived at {{storeName}} ({{price}}). Want first look? {{url}}' },
      { name: 'Early access', tone: 'urgent', body: '{{firstName}}, {{product}} just dropped and it’s already moving fast ⏳ Grab yours: {{url}}' },
      { name: 'Curated', tone: 'premium', body: 'Hi {{firstName}} ✨ We added {{product}} — picked with your style in mind. Have a look: {{url}}' },
      { name: 'Just landed', tone: 'playful', body: 'Psst 👀 {{product}} just walked into {{storeName}}. Say hi: {{url}}' },
      { name: 'New + picks', tone: 'value', body: 'New in: {{product}} 🆕 You may also love {{recommended}}. Shop: {{url}}' },
    ],
  },

  BEST_SELLING: {
    EMAIL: [
      { name: 'Crowd favourite', tone: 'friendly', subject: 'Everyone’s buying {{product}}', body: 'Hi {{firstName}}, {{product}} is our best-seller at {{storeName}} right now. See what the buzz is about: {{url}}' },
      { name: 'Almost sold out', tone: 'urgent', subject: '{{product}} is flying off the shelf', body: '{{firstName}}, our #1 seller {{product}} is going fast. Don’t miss it: {{url}}' },
      { name: 'Bestseller', tone: 'premium', subject: 'The piece everyone’s talking about', body: 'Hi {{firstName}}, {{product}} has become a {{storeName}} signature. Discover why: {{url}}' },
      { name: 'Loved by many', tone: 'playful', body: '{{firstName}}, {{product}} is winning hearts (and carts) 💖 Join the club: {{url}}', subject: '{{product}} — loved by hundreds 💖' },
      { name: 'Top pick + you', tone: 'value', subject: 'Our top pick — and yours', body: 'Hi {{firstName}}, {{product}} is our top seller. Paired with your taste, {{recommended}} is a great add. Shop: {{url}}' },
    ],
    SMS: [
      { name: 'Crowd favourite', tone: 'friendly', body: '{{storeName}}: {{product}} is our #1 seller. See it {{url}}' },
      { name: 'Almost gone', tone: 'urgent', body: '{{firstName}}, best-seller {{product}} going fast. Grab it {{url}}' },
      { name: 'Bestseller', tone: 'premium', body: 'The one everyone loves: {{product}}. {{url}}' },
      { name: 'Loved', tone: 'playful', body: '{{product}} is winning carts 💖 Join in {{url}}' },
      { name: 'Top + you', tone: 'value', body: 'Top pick: {{product}}. Also for you: {{recommended}}. {{url}}' },
    ],
    WHATSAPP: [
      { name: 'Crowd favourite', tone: 'friendly', body: 'Hi {{firstName}}! 🔥 {{product}} is the most-loved pick at {{storeName}} right now. Take a look: {{url}}' },
      { name: 'Almost gone', tone: 'urgent', body: '{{firstName}}, our best-seller {{product}} is going fast ⏳ Get yours before it’s gone: {{url}}' },
      { name: 'Bestseller', tone: 'premium', body: 'Hi {{firstName}} ✨ {{product}} has become a {{storeName}} signature. See why everyone loves it: {{url}}' },
      { name: 'Loved', tone: 'playful', body: '{{product}} is winning hearts and carts 💖 Want in, {{firstName}}? {{url}}' },
      { name: 'Top + you', tone: 'value', body: 'Top seller: {{product}} 🔥 You may also love {{recommended}}. Shop: {{url}}' },
    ],
  },

  SLOW_MOVING: {
    EMAIL: [
      { name: 'Last chance', tone: 'urgent', subject: 'Last few of {{product}} — {{discount}} off', body: 'Hi {{firstName}}, we’re clearing {{product}} with {{discount}} off using code {{code}}. Once it’s gone, it’s gone: {{url}}' },
      { name: 'Hidden gem', tone: 'friendly', subject: 'A hidden gem just for you', body: '{{firstName}}, {{product}} hasn’t had its moment yet — and we think you’ll love it. Now {{discount}} off with {{code}}: {{url}}' },
      { name: 'Quiet luxury', tone: 'premium', subject: 'An underrated favourite, now {{discount}} off', body: 'Hi {{firstName}}, {{product}} is one of our quiet stars. Enjoy {{discount}} off with {{code}}: {{url}}' },
      { name: 'Take it home', tone: 'playful', body: '{{product}} has been waiting for the right person 🥹 Is it you, {{firstName}}? {{discount}} off — code {{code}}: {{url}}', subject: '{{product}} misses you 🥹 ({{discount}} off)' },
      { name: 'Clear-out + picks', tone: 'value', subject: 'Clear-out picks, {{discount}} off', body: 'Hi {{firstName}}, save {{discount}} on {{product}} with {{code}}. You might also like {{recommended}}: {{url}}' },
    ],
    SMS: [
      { name: 'Last chance', tone: 'urgent', body: 'Last few: {{product}} now {{discount}} off, code {{code}}. {{url}}' },
      { name: 'Hidden gem', tone: 'friendly', body: '{{firstName}}, {{product}} — {{discount}} off with {{code}}. {{url}}' },
      { name: 'Quiet star', tone: 'premium', body: 'Underrated: {{product}}, {{discount}} off ({{code}}). {{url}}' },
      { name: 'Take it home', tone: 'playful', body: '{{product}} misses you 🥹 {{discount}} off, {{code}}. {{url}}' },
      { name: 'Clear-out', tone: 'value', body: 'Save {{discount}} on {{product}} ({{code}}). Also: {{recommended}}. {{url}}' },
    ],
    WHATSAPP: [
      { name: 'Last chance', tone: 'urgent', body: '{{firstName}}, last few of {{product}} ⏳ Now {{discount}} off with code {{code}}. Grab it: {{url}}' },
      { name: 'Hidden gem', tone: 'friendly', body: 'Hi {{firstName}}! 💎 {{product}} is a hidden gem — and it’s {{discount}} off for you with {{code}}: {{url}}' },
      { name: 'Quiet star', tone: 'premium', body: 'Hi {{firstName}} ✨ {{product}} is one of our quiet stars — enjoy {{discount}} off with {{code}}: {{url}}' },
      { name: 'Take it home', tone: 'playful', body: '{{product}} has been waiting for the right person 🥹 {{discount}} off with {{code}}, {{firstName}}: {{url}}' },
      { name: 'Clear-out', tone: 'value', body: 'Save {{discount}} on {{product}} with {{code}} 🏷️ You may also like {{recommended}}: {{url}}' },
    ],
  },

  LOW_STOCK: {
    EMAIL: [
      { name: 'Almost gone', tone: 'urgent', subject: 'Only {{stockLeft}} left — {{product}}', body: 'Hi {{firstName}}, just {{stockLeft}} of {{product}} remain at {{storeName}}. Secure yours: {{url}}' },
      { name: 'Selling out', tone: 'friendly', subject: '{{product}} is nearly sold out', body: '{{firstName}}, {{product}} is down to its last {{stockLeft}}. We’d hate for you to miss it: {{url}}' },
      { name: 'Last units', tone: 'premium', subject: 'The final {{stockLeft}} of {{product}}', body: 'Hi {{firstName}}, only {{stockLeft}} of {{product}} are left. Claim yours before they’re gone: {{url}}' },
      { name: 'Hurry', tone: 'playful', body: '⏳ {{stockLeft}} left! {{product}} is about to vanish, {{firstName}}. Quick: {{url}}', subject: 'Eep! Only {{stockLeft}} of {{product}} left' },
      { name: 'Low stock + picks', tone: 'value', subject: 'Almost gone: {{product}}', body: 'Hi {{firstName}}, only {{stockLeft}} of {{product}} left. Also worth a look: {{recommended}}. Shop: {{url}}' },
    ],
    SMS: [
      { name: 'Almost gone', tone: 'urgent', body: 'Only {{stockLeft}} left of {{product}}! Grab it {{url}}' },
      { name: 'Selling out', tone: 'friendly', body: '{{firstName}}, {{product}} down to {{stockLeft}}. {{url}}' },
      { name: 'Last units', tone: 'premium', body: 'Final {{stockLeft}} of {{product}}. Claim yours {{url}}' },
      { name: 'Hurry', tone: 'playful', body: '⏳ {{stockLeft}} left! {{product}} {{url}}' },
      { name: 'Low + picks', tone: 'value', body: '{{stockLeft}} left: {{product}}. Also: {{recommended}}. {{url}}' },
    ],
    WHATSAPP: [
      { name: 'Almost gone', tone: 'urgent', body: '{{firstName}}, only {{stockLeft}} of {{product}} left ⏳ Secure yours now: {{url}}' },
      { name: 'Selling out', tone: 'friendly', body: 'Hi {{firstName}}! {{product}} is nearly sold out — just {{stockLeft}} left. {{url}}' },
      { name: 'Last units', tone: 'premium', body: 'Hi {{firstName}} ✨ The final {{stockLeft}} of {{product}} are here. Claim yours: {{url}}' },
      { name: 'Hurry', tone: 'playful', body: '⏳ Eep! {{stockLeft}} left of {{product}}, {{firstName}}. Quick before it’s gone: {{url}}' },
      { name: 'Low + picks', tone: 'value', body: 'Almost gone: {{product}} ({{stockLeft}} left). You may also like {{recommended}}: {{url}}' },
    ],
  },

  BACK_IN_STOCK: {
    EMAIL: [
      { name: 'It’s back', tone: 'friendly', subject: 'Good news — {{product}} is back!', body: 'Hi {{firstName}}, {{product}} you wanted is back in stock at {{storeName}}. Grab it this time: {{url}}' },
      { name: 'Restocked, hurry', tone: 'urgent', subject: '{{product}} is back (and going fast)', body: '{{firstName}}, {{product}} is back in stock — but not for long. Get it before it sells out again: {{url}}' },
      { name: 'Back by demand', tone: 'premium', subject: 'Back by popular demand: {{product}}', body: 'Hi {{firstName}}, the much-loved {{product}} has returned. We saved you the trouble of waiting: {{url}}' },
      { name: 'Reunion', tone: 'playful', body: 'Reunited! {{product}} is back 🎉 Pick up where you left off, {{firstName}}: {{url}}', subject: '{{product}} is back 🎉' },
      { name: 'Back + picks', tone: 'value', subject: '{{product}} is back — plus picks for you', body: 'Hi {{firstName}}, {{product}} is back in stock. You may also like {{recommended}}. Shop: {{url}}' },
    ],
    SMS: [
      { name: 'It’s back', tone: 'friendly', body: '{{product}} is back in stock! Grab it {{url}}' },
      { name: 'Hurry', tone: 'urgent', body: '{{firstName}}, {{product}} back & going fast. {{url}}' },
      { name: 'By demand', tone: 'premium', body: 'Back by demand: {{product}}. {{url}}' },
      { name: 'Reunion', tone: 'playful', body: 'Reunited 🎉 {{product}} is back. {{url}}' },
      { name: 'Back + picks', tone: 'value', body: '{{product}} back. Also: {{recommended}}. {{url}}' },
    ],
    WHATSAPP: [
      { name: 'It’s back', tone: 'friendly', body: 'Hi {{firstName}}! 🎉 {{product}} you wanted is back in stock. Grab it this time: {{url}}' },
      { name: 'Hurry', tone: 'urgent', body: '{{firstName}}, {{product}} is back ⏳ but moving fast — get it before it’s gone again: {{url}}' },
      { name: 'By demand', tone: 'premium', body: 'Hi {{firstName}} ✨ Back by popular demand — {{product}} has returned. We saved you the wait: {{url}}' },
      { name: 'Reunion', tone: 'playful', body: 'Reunited! 🥳 {{product}} is back in stock, {{firstName}}. Pick up where you left off: {{url}}' },
      { name: 'Back + picks', tone: 'value', body: '{{product}} is back! 🎉 You may also love {{recommended}}: {{url}}' },
    ],
  },

  DISCOUNT: {
    EMAIL: [
      { name: 'Offer for you', tone: 'friendly', subject: 'A little something: {{discount}} off', body: 'Hi {{firstName}}, here’s {{discount}} off at {{storeName}} with code {{code}}. Treat yourself: {{url}}' },
      { name: 'Ends soon', tone: 'urgent', subject: 'Your {{discount}} off ends soon', body: '{{firstName}}, your {{discount}} off (code {{code}}) won’t last. Use it before it expires: {{url}}' },
      { name: 'Members offer', tone: 'premium', subject: 'An offer reserved for you', body: 'Hi {{firstName}}, enjoy {{discount}} off as a valued {{storeName}} customer. Code {{code}}: {{url}}' },
      { name: 'Treat day', tone: 'playful', body: 'Treat-yourself o’clock 🕑 {{discount}} off with {{code}}, {{firstName}}: {{url}}', subject: 'It’s treat-yourself o’clock 🕑 ({{discount}} off)' },
      { name: 'Offer + picks', tone: 'value', subject: '{{discount}} off — picked for you', body: 'Hi {{firstName}}, save {{discount}} with {{code}}. Perfect on {{recommended}}: {{url}}' },
    ],
    SMS: [
      { name: 'Offer', tone: 'friendly', body: '{{storeName}}: {{discount}} off with {{code}}. {{url}}' },
      { name: 'Ends soon', tone: 'urgent', body: '{{firstName}}, {{discount}} off ends soon. Code {{code}} {{url}}' },
      { name: 'For you', tone: 'premium', body: 'Reserved for you: {{discount}} off, {{code}}. {{url}}' },
      { name: 'Treat', tone: 'playful', body: 'Treat yourself 🕑 {{discount}} off, {{code}}. {{url}}' },
      { name: 'Offer + picks', tone: 'value', body: 'Save {{discount}} ({{code}}) on {{recommended}}. {{url}}' },
    ],
    WHATSAPP: [
      { name: 'Offer', tone: 'friendly', body: 'Hi {{firstName}}! 🎁 Here’s {{discount}} off at {{storeName}} with code {{code}}. Treat yourself: {{url}}' },
      { name: 'Ends soon', tone: 'urgent', body: '{{firstName}}, your {{discount}} off (code {{code}}) ends soon ⏳ Use it before it’s gone: {{url}}' },
      { name: 'For you', tone: 'premium', body: 'Hi {{firstName}} ✨ Enjoy {{discount}} off as a valued customer. Code {{code}}: {{url}}' },
      { name: 'Treat', tone: 'playful', body: 'Treat-yourself o’clock 🕑 {{discount}} off with {{code}}, {{firstName}}: {{url}}' },
      { name: 'Offer + picks', tone: 'value', body: 'Save {{discount}} with {{code}} 🏷️ Great on {{recommended}}: {{url}}' },
    ],
  },

  FESTIVE_DISCOUNT: {
    EMAIL: [
      { name: 'Festive offer', tone: 'friendly', subject: '{{festival}} offer: {{discount}} off at {{storeName}}', body: 'Happy {{festival}}, {{firstName}}! Celebrate with {{discount}} off using {{code}}: {{url}}' },
      { name: 'Festive rush', tone: 'urgent', subject: 'Last days of our {{festival}} sale', body: '{{firstName}}, the {{festival}} sale ends soon — {{discount}} off with {{code}}. Don’t miss it: {{url}}' },
      { name: 'Festive luxe', tone: 'premium', subject: 'Celebrate {{festival}} in style', body: 'Hi {{firstName}}, mark {{festival}} with something special — {{discount}} off at {{storeName}}, code {{code}}: {{url}}' },
      { name: 'Festive fun', tone: 'playful', body: '🎉 {{festival}} is here and so is {{discount}} off! Code {{code}}, {{firstName}}: {{url}}', subject: '🎉 {{festival}} = {{discount}} off!' },
      { name: 'Festive + picks', tone: 'value', subject: '{{festival}} picks for you, {{discount}} off', body: 'Happy {{festival}}, {{firstName}}! Save {{discount}} with {{code}}. We picked {{recommended}} for you: {{url}}' },
    ],
    SMS: [
      { name: 'Festive', tone: 'friendly', body: 'Happy {{festival}}! {{discount}} off, code {{code}}. {{url}}' },
      { name: 'Rush', tone: 'urgent', body: '{{firstName}}, {{festival}} sale ends soon: {{discount}} off {{code}}. {{url}}' },
      { name: 'Luxe', tone: 'premium', body: 'Celebrate {{festival}}: {{discount}} off, {{code}}. {{url}}' },
      { name: 'Fun', tone: 'playful', body: '🎉 {{festival}} = {{discount}} off! Code {{code}} {{url}}' },
      { name: 'Festive + picks', tone: 'value', body: '{{festival}}: {{discount}} off ({{code}}) on {{recommended}}. {{url}}' },
    ],
    WHATSAPP: [
      { name: 'Festive', tone: 'friendly', body: 'Happy {{festival}}, {{firstName}}! 🪔 Celebrate with {{discount}} off at {{storeName}} using {{code}}: {{url}}' },
      { name: 'Rush', tone: 'urgent', body: '{{firstName}}, our {{festival}} sale ends soon ⏳ {{discount}} off with {{code}}. Don’t miss out: {{url}}' },
      { name: 'Luxe', tone: 'premium', body: 'Hi {{firstName}} ✨ Mark {{festival}} with something special — {{discount}} off, code {{code}}: {{url}}' },
      { name: 'Fun', tone: 'playful', body: '🎉 {{festival}} is here and so is {{discount}} off! Code {{code}}, {{firstName}}: {{url}}' },
      { name: 'Festive + picks', tone: 'value', body: 'Happy {{festival}}! 🪔 {{discount}} off with {{code}}. We picked {{recommended}} for you: {{url}}' },
    ],
  },

  ABANDONED_CART: {
    EMAIL: [
      { name: 'Still there', tone: 'friendly', subject: 'You left {{product}} in your cart', body: 'Hi {{firstName}}, your {{product}} is still waiting in your {{storeName}} cart. Finish up here: {{cartUrl}}' },
      { name: 'Selling out', tone: 'urgent', subject: 'Your cart is about to expire', body: '{{firstName}}, {{product}} in your cart is in demand and may sell out. Complete your order: {{cartUrl}}' },
      { name: 'Need a hand', tone: 'premium', subject: 'Can we help you check out?', body: 'Hi {{firstName}}, we saved your cart with {{product}}. If anything held you back, just reply — otherwise, checkout here: {{cartUrl}}' },
      { name: 'Sweetener', tone: 'value', subject: 'Your cart + {{discount}} off', body: '{{firstName}}, here’s {{discount}} off to finish your order for {{product}}. Use {{code}}: {{cartUrl}}' },
      { name: 'Friendly nudge', tone: 'playful', body: 'Your {{product}} is getting lonely 🛒 Take it home, {{firstName}}: {{cartUrl}}', subject: 'Your cart misses you 🛒' },
    ],
    SMS: [
      { name: 'Still there', tone: 'friendly', body: '{{firstName}}, {{product}} is still in your cart. Finish {{cartUrl}}' },
      { name: 'Selling out', tone: 'urgent', body: 'Your {{product}} may sell out. Checkout {{cartUrl}}' },
      { name: 'Help', tone: 'premium', body: 'Saved your cart ({{product}}). Need help? {{cartUrl}}' },
      { name: 'Sweetener', tone: 'value', body: '{{discount}} off to finish: {{product}}, code {{code}}. {{cartUrl}}' },
      { name: 'Nudge', tone: 'playful', body: 'Your cart misses you 🛒 {{cartUrl}}' },
    ],
    WHATSAPP: [
      { name: 'Still there', tone: 'friendly', body: 'Hi {{firstName}}! 🛒 Your {{product}} is still in your {{storeName}} cart. Want to finish up? {{cartUrl}}' },
      { name: 'Selling out', tone: 'urgent', body: '{{firstName}}, {{product}} in your cart is in demand ⏳ Complete your order before it sells out: {{cartUrl}}' },
      { name: 'Help', tone: 'premium', body: 'Hi {{firstName}} ✨ We saved your cart with {{product}}. If something held you back, just reply — or checkout here: {{cartUrl}}' },
      { name: 'Sweetener', tone: 'value', body: '{{firstName}}, here’s {{discount}} off to finish your {{product}} order 🎁 Use {{code}}: {{cartUrl}}' },
      { name: 'Nudge', tone: 'playful', body: 'Your {{product}} is getting lonely 🛒 Take it home, {{firstName}}: {{cartUrl}}' },
    ],
  },

  COHORT_OFFER: {
    EMAIL: [
      { name: 'For your taste', tone: 'premium', subject: 'Picked for {{firstName}}: {{recommended}}', body: 'Hi {{firstName}}, shoppers like you love {{recommended}}. We think it’s a perfect match for you: {{url}}' },
      { name: 'Others loved', tone: 'friendly', subject: 'People with your taste are loving these', body: '{{firstName}}, customers in your circle picked up {{recommended}}. Take a look: {{url}}' },
      { name: 'Complete the look', tone: 'value', subject: 'Complete your {{cohort}} look', body: 'Hi {{firstName}}, {{recommended}} pairs beautifully with what you love. Add it on: {{url}}' },
      { name: 'Just dropped', tone: 'urgent', subject: 'Trending in your circle: {{recommended}}', body: '{{firstName}}, {{recommended}} is trending with shoppers like you — and stock is limited: {{url}}' },
      { name: 'Made for you', tone: 'playful', body: 'We did some matchmaking 💘 {{firstName}}, meet {{recommended}}: {{url}}', subject: 'We found your match: {{recommended}} 💘' },
    ],
    SMS: [
      { name: 'For you', tone: 'premium', body: 'Picked for you: {{recommended}}. {{url}}' },
      { name: 'Others loved', tone: 'friendly', body: '{{firstName}}, shoppers like you love {{recommended}}. {{url}}' },
      { name: 'Complete', tone: 'value', body: 'Pairs with your style: {{recommended}}. {{url}}' },
      { name: 'Trending', tone: 'urgent', body: 'Trending in your circle: {{recommended}}. {{url}}' },
      { name: 'Match', tone: 'playful', body: 'We found your match 💘 {{recommended}}. {{url}}' },
    ],
    WHATSAPP: [
      { name: 'For you', tone: 'premium', body: 'Hi {{firstName}} ✨ Shoppers like you love {{recommended}} — we think it’s a perfect match for you: {{url}}' },
      { name: 'Others loved', tone: 'friendly', body: 'Hi {{firstName}}! Customers in your circle picked up {{recommended}}. Thought you’d like it too: {{url}}' },
      { name: 'Complete', tone: 'value', body: '{{firstName}}, {{recommended}} pairs beautifully with what you love. Add it on: {{url}}' },
      { name: 'Trending', tone: 'urgent', body: '{{firstName}}, {{recommended}} is trending with shoppers like you ⏳ and stock is limited: {{url}}' },
      { name: 'Match', tone: 'playful', body: 'We did some matchmaking 💘 {{firstName}}, meet {{recommended}}: {{url}}' },
    ],
  },
};

const CHANNELS: NotificationChannel[] = ['EMAIL', 'SMS', 'WHATSAPP'];

// Flatten the authoring shape into a keyed, queryable list once at module load.
export const ENGAGEMENT_TEMPLATES: EngTemplate[] = (Object.keys(LIBRARY) as EngagementTrigger[]).flatMap(
  (trigger) =>
    CHANNELS.flatMap((channel) =>
      LIBRARY[trigger][channel].map((d, i) => ({
        key: `${trigger}:${channel}:${i + 1}`,
        trigger,
        channel,
        variant: i + 1,
        name: d.name,
        tone: d.tone,
        subject: d.subject,
        body: d.body,
      })),
    ),
);

const BY_KEY = new Map(ENGAGEMENT_TEMPLATES.map((t) => [t.key, t]));

export function templateByKey(key: string): EngTemplate | undefined {
  return BY_KEY.get(key);
}

export function templatesFor(trigger: EngagementTrigger, channel: NotificationChannel): EngTemplate[] {
  return ENGAGEMENT_TEMPLATES.filter((t) => t.trigger === trigger && t.channel === channel);
}

export const ENGAGEMENT_TRIGGERS = Object.keys(LIBRARY) as EngagementTrigger[];
