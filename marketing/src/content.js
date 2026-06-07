// Copy for both landing pages. Kept as data so the two audiences stay in sync
// in structure while differing in message.

export const MERCHANT = {
  audience: 'merchant',
  brand: 'Imagine Commerce',
  domain: 'ecom.imagine.bo',
  nav: [
    { label: 'Why us', href: '#why' },
    { label: 'Features', href: '#features' },
    { label: 'Compare', href: '#compare' },
    { label: 'Reviews', href: '#reviews' },
  ],
  hero: {
    badge: 'Agentic-first commerce for India',
    title: 'Describe your store. Our AI builds it.',
    subtitle:
      'Launch a complete online store — products, payments, WhatsApp, GST invoicing and growth — by simply telling us what you sell. No themes to wrestle, no plugins to stitch.',
    builderPlaceholder: 'e.g. I sell handmade soy candles in Bengaluru and want a warm, cozy store with COD…',
    builderCta: 'Start building — free',
  },
  why: {
    title: 'Why we’re the right partner for your success',
    body:
      'Most platforms hand you a blank theme and a plugin marketplace, then leave you to integrate, configure and maintain it. We’re built the opposite way: one platform where an AI agent sets up, runs and grows your store — and every capability works on day one, tuned for Indian commerce.',
    points: [
      { title: 'Built for India', desc: 'Razorpay & GoKwik checkout, COD, UPI, GST tax invoices, and WhatsApp — native, not bolt-ons.' },
      { title: 'AI does the heavy lifting', desc: 'From product listings to pricing, support replies and re-marketing — the agent works while you sleep.' },
      { title: 'One bill, everything included', desc: 'No paid apps for reviews, loyalty, subscriptions or shipping. It’s all in the box.' },
      { title: 'You’re never stuck', desc: 'Migrate in from Shopify/Woo/Dukaan in minutes, and export your data any time.' },
    ],
  },
  benefits: [
    { title: 'Launch in minutes', desc: 'Go from an idea to a live, payment-ready storefront the same afternoon.' },
    { title: 'Sell on WhatsApp', desc: 'Automated order updates, abandoned-cart recovery, and an AI support agent that hands off to you.' },
    { title: 'Stay compliant', desc: 'GST-correct tax invoices, credit notes, and a sales register — generated automatically.' },
    { title: 'Grow on autopilot', desc: 'Cohorts, loyalty, subscriptions, reviews and engagement campaigns built in.' },
  ],
  features: [
    { icon: 'Sparkles', title: 'AI store builder', desc: 'Describe your business; the agent creates products, copy, collections and a themed storefront.' },
    { icon: 'CreditCard', title: 'India-ready checkout', desc: 'Razorpay & GoKwik, UPI, cards, COD, and discount codes — secure and fast.' },
    { icon: 'MessageCircle', title: 'WhatsApp commerce', desc: 'Sell, notify and support over WhatsApp with automation and a 2-rebuttal human handoff.' },
    { icon: 'Receipt', title: 'GST invoicing & accounting', desc: 'Tax invoices (CGST/SGST/IGST), credit notes, sales register and P&L-lite.' },
    { icon: 'Truck', title: 'Shipping & returns', desc: 'Delhivery integration, self-serve returns and cancellations, tracking baked in.' },
    { icon: 'TrendingUp', title: 'Growth suite', desc: 'Loyalty, subscriptions, reviews, cohorts and re-marketing — no extra apps.' },
  ],
  value: {
    title: 'Real value, not feature bloat',
    stats: [
      { value: '₹0', label: 'to start — no setup fee' },
      { value: '10 min', label: 'idea to live store' },
      { value: '12+', label: 'paid apps replaced' },
      { value: '24×7', label: 'AI support & selling' },
    ],
  },
  reviews: [
    { name: 'Aarti Menon', role: 'Founder, Kindle & Wax', quote: 'I typed two lines about my candles and had a working store with COD and WhatsApp by evening. It would’ve taken weeks on Shopify.', rating: 5 },
    { name: 'Rohit Shah', role: 'Owner, Shah Kitchenware', quote: 'GST invoices and the sales register alone saved my accountant hours. Everything just works for India.', rating: 5 },
    { name: 'Neha Kapoor', role: 'Founder, Aura Perfumes', quote: 'The AI wrote my product descriptions and set up loyalty. I focus on the scents, it runs the shop.', rating: 5 },
  ],
  comparison: {
    title: 'How we compare',
    subtitle: 'Everything below is included with us — no paid apps, no plugin hunting.',
    competitors: ['Imagine', 'Shopify', 'WooCommerce', 'Dukaan'],
    rows: [
      { feature: 'AI builds your store from a prompt', values: [true, false, false, false] },
      { feature: 'India checkout (Razorpay/GoKwik, UPI, COD)', values: [true, 'addon', 'plugin', true] },
      { feature: 'GST tax invoices & accounting built in', values: [true, 'addon', 'plugin', 'partial'] },
      { feature: 'WhatsApp selling + AI support agent', values: [true, 'addon', 'plugin', 'partial'] },
      { feature: 'Loyalty, subscriptions, reviews included', values: [true, 'addon', 'plugin', false] },
      { feature: 'One-click migration in & data export', values: [true, 'partial', 'partial', false] },
      { feature: 'Agent/MCP API to operate the store', values: [true, false, false, false] },
      { feature: 'Monthly cost of typical app stack', values: ['Included', '₹2k–8k', '₹2k–10k', 'Limited'] },
    ],
  },
  finalCta: {
    title: 'Tell us what you sell. We’ll build the store.',
    subtitle: 'It’s free to start — import your logo and product photos and watch it come together.',
  },
};

export const PARTNER = {
  audience: 'partner',
  brand: 'Imagine Partners',
  domain: 'ecompartner.imagine.bo',
  nav: [
    { label: 'Why partner', href: '#why' },
    { label: 'Features', href: '#features' },
    { label: 'Reviews', href: '#reviews' },
  ],
  hero: {
    badge: 'Build stores for clients, faster',
    title: 'Spin up client stores in minutes — and earn recurring revenue.',
    subtitle:
      'Agencies, freelancers and resellers: launch fully-featured Indian commerce stores for your clients with AI, manage them from one console, and earn on every active store.',
    builderPlaceholder: 'e.g. I run a design studio in Pune and build D2C stores for fashion & food brands…',
    builderCta: 'Start a client store',
  },
  why: {
    title: 'Why we’re the right partner for your success',
    body:
      'You shouldn’t have to assemble themes, plugins and integrations for every client. Build on a platform where the AI does the setup and the heavy lifting, you keep one dashboard across all clients, and recurring revenue compounds as your portfolio grows.',
    points: [
      { title: 'Launch clients in minutes', desc: 'Describe the client’s business; the agent builds a store you can hand over or manage.' },
      { title: 'One console, every client', desc: 'See stores, renewals and health across your whole book of business.' },
      { title: 'Recurring revenue', desc: 'Earn on every active store — margins that grow with your portfolio, not your workload.' },
      { title: 'Less maintenance', desc: 'Updates, compliance and integrations are handled — so support tickets shrink.' },
    ],
  },
  benefits: [
    { title: 'Faster delivery', desc: 'Cut store builds from weeks to an afternoon and take on more clients.' },
    { title: 'Higher margins', desc: 'No per-client plugin bills; one platform fee, recurring partner revenue.' },
    { title: 'Stickier clients', desc: 'Stores that run themselves keep clients happy and renewing.' },
    { title: 'White-glove tooling', desc: 'Deep-link into any client store, manage renewals, and prove ROI.' },
  ],
  features: [
    { icon: 'Sparkles', title: 'AI store builder', desc: 'Generate a client’s full store — catalog, copy and theme — from a brief.' },
    { icon: 'LayoutDashboard', title: 'Partner console', desc: 'Clients, store health, and renewals in one place, with one login.' },
    { icon: 'IndianRupee', title: 'Recurring payouts', desc: 'Earn on every active store; transparent renewals and reporting.' },
    { icon: 'Boxes', title: 'Full feature set', desc: 'Payments, WhatsApp, GST, shipping, loyalty — included for every client.' },
    { icon: 'Repeat', title: 'Migrations included', desc: 'Move clients off Shopify/Woo/Dukaan in minutes, data intact.' },
    { icon: 'ShieldCheck', title: 'Secure access', desc: 'Scoped partner access with 2FA and per-client permissions.' },
  ],
  value: {
    title: 'A partnership that compounds',
    stats: [
      { value: 'Minutes', label: 'to launch a client store' },
      { value: 'Recurring', label: 'revenue per active store' },
      { value: '1', label: 'console for all clients' },
      { value: '0', label: 'plugin bills to manage' },
    ],
  },
  reviews: [
    { name: 'Vikram Rao', role: 'Founder, Northstar Studio', quote: 'We moved our D2C clients over and tripled how many stores we can deliver a month. The AI setup is unreal.', rating: 5 },
    { name: 'Sana Qureshi', role: 'Freelance store builder', quote: 'Recurring revenue on every store changed my business. I build once and earn every month.', rating: 5 },
    { name: 'Imran Sheikh', role: 'Director, Cartlift Agency', quote: 'One dashboard across all clients plus GST and WhatsApp built in means far fewer support tickets.', rating: 5 },
  ],
  finalCta: {
    title: 'Build your first client store today.',
    subtitle: 'Describe a client’s business, import their assets, and see a store take shape in minutes.',
  },
};
