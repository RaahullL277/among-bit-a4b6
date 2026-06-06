import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCommerce, type TenantContext } from '@acp/core';
import type { Session } from './server.js';

/**
 * Registers the commerce tools on an MCP server. Each tool is a thin wrapper
 * over the same @acp/core service layer the REST API uses — so an agent and a
 * dashboard drive identical behavior. The `session` resolves the effective
 * tenant context (a merchant's own store, or a partner's chosen client), and
 * also gates the onboarding + partner tools.
 */
export function registerTools(server: McpServer, session: Session) {
  const commerce = getCommerce();
  const getContext = () => session.tenantContext();

  const ok = (data: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  });
  const fail = (err: unknown) => ({
    isError: true,
    content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
  });

  // Wraps a handler with context resolution + uniform error reporting.
  const tool =
    <A>(handler: (ctx: TenantContext, args: A) => Promise<unknown>) =>
    async (args: A) => {
      try {
        return ok(await handler(await getContext(), args));
      } catch (err) {
        return fail(err);
      }
    };

  // --- Connector onboarding (works with no credential) ----------------------
  server.registerTool(
    'whoami',
    { description: 'Describe the current connector session (merchant, partner, or new user) and what to do next.', inputSchema: {} },
    async () => {
      const hint =
        session.kind === 'merchant'
          ? 'You are connected as a merchant. Use launch_store or create_store/create_product to build.'
          : session.kind === 'partner'
            ? 'You are connected as a partner. Use list_clients + use_client to pick a client, then build for them.'
            : 'No account yet. Call create_account to start, then launch_store.';
      return ok({ session: session.kind, hint });
    },
  );

  server.registerTool(
    'create_account',
    {
      description:
        'Create a brand-new merchant workspace (for a user with no account yet). Returns an API key to set as the connector credential; you can also keep building in this same session right away.',
      inputSchema: {
        businessName: z.string().describe('The store/company name'),
        ownerEmail: z.string().describe('Owner email (used for login + alerts)'),
        ownerName: z.string().optional(),
      },
    },
    async (a: any) => {
      try {
        if (session.kind === 'partner') throw new Error('Partners build for clients — use list_clients + use_client instead of create_account.');
        const res = await commerce.onboarding.createAccount(a);
        session.adopt({ tenantId: res.tenantId }); // continue building in this session
        return ok(res);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'launch_store',
    {
      description:
        'Build AND launch a complete shoppable store in one call: store + stubbed payment + active products + a published storefront page + theme. Returns the live storefront URL.',
      inputSchema: {
        name: z.string(),
        currency: z.string().optional().describe('ISO currency, defaults to INR'),
        country: z.string().optional(),
        tagline: z.string().optional().describe('Hero subheading on the storefront'),
        brandColor: z.string().optional().describe('Hex, e.g. #1c1917'),
        accentColor: z.string().optional().describe('Hex, e.g. #4f46e5'),
        templateId: z.string().optional().describe('Start from a design template (see list_store_templates), e.g. "jewellery-classic-gold"'),
        publish: z.boolean().optional().describe('Publish the storefront now (default true)'),
        products: z
          .array(
            z.object({
              title: z.string(),
              description: z.string().optional(),
              priceMinor: z.number().int().nonnegative().describe('Price in minor units (paise for INR)'),
              costMinor: z.number().int().optional(),
              inventory: z.number().int().optional(),
            }),
          )
          .optional(),
      },
    },
    tool((ctx, a: any) => commerce.onboarding.launchStore(ctx, a)),
  );

  server.registerTool(
    'list_store_templates',
    {
      description: 'List ready-made store design templates (theme + storefront layout). Optionally filter by category: fashion, lifestyle, cosmetics, jewellery.',
      inputSchema: { category: z.enum(['fashion', 'lifestyle', 'cosmetics', 'jewellery']).optional() },
    },
    async (a: any) => ok(commerce.templates.list(a?.category)),
  );

  server.registerTool(
    'apply_store_template',
    {
      description: 'Apply a design template to a store: sets the theme and publishes a storefront home page (the store\'s own products fill the grid).',
      inputSchema: { storeId: z.string(), templateId: z.string(), publish: z.boolean().optional() },
    },
    tool((ctx, a: any) => commerce.templates.apply(ctx, a.storeId, a.templateId, { publish: a.publish })),
  );

  // --- Partner tools (only when connected as a partner) ---------------------
  if (session.kind === 'partner') {
    server.registerTool(
      'partner_dashboard',
      { description: 'Your partner dashboard: client GMV, commission earnings, MRR, and upcoming renewals.', inputSchema: {} },
      async () => {
        try {
          return ok(await commerce.partners.dashboard(session.partner!.partnerId));
        } catch (err) {
          return fail(err);
        }
      },
    );
    server.registerTool(
      'list_clients',
      { description: 'List the client stores you manage (with GMV, earnings, and your access level).', inputSchema: {} },
      async () => {
        try {
          return ok(await commerce.partners.clients(session.partner!.partnerId));
        } catch (err) {
          return fail(err);
        }
      },
    );
    server.registerTool(
      'use_client',
      {
        description: 'Choose which client store to build/manage. Subsequent tools act on this client (subject to the access level the client granted you).',
        inputSchema: { tenantId: z.string().describe('The client tenantId from list_clients') },
      },
      async (a: any) => {
        try {
          session.setActiveClient(a.tenantId);
          const ctx = await session.tenantContext();
          return ok({ activeClient: a.tenantId, permissions: ctx.actor?.permissions ?? [], message: 'Now managing this client store.' });
        } catch (err) {
          return fail(err);
        }
      },
    );
    server.registerTool(
      'create_client',
      {
        description: 'Onboard a NEW client: spins up a fresh client workspace (store + owner + API key) linked to you, with an optional plan fee + renewal. Returns credentials to hand to the client.',
        inputSchema: {
          businessName: z.string(),
          ownerEmail: z.string().describe('The client owner\'s email (magic-link login)'),
          ownerName: z.string().optional(),
          monthlyFeeMinor: z.number().optional().describe('Recurring plan fee in minor units (paise for INR)'),
          renewsAt: z.string().optional().describe('Next renewal date (ISO)'),
        },
      },
      async (a: any) => {
        try {
          return ok(await commerce.partners.createClientForPartner(session.partner!.partnerId, a));
        } catch (err) {
          return fail(err);
        }
      },
    );
    server.registerTool(
      'update_client_plan',
      {
        description: 'Update one of your clients\' plan: monthly fee and/or renewal date.',
        inputSchema: { clientId: z.string().describe('The clientId from list_clients'), monthlyFeeMinor: z.number().optional(), renewsAt: z.string().optional() },
      },
      async (a: any) => {
        try {
          return ok(await commerce.partners.updateClientForPartner(session.partner!.partnerId, a.clientId, a));
        } catch (err) {
          return fail(err);
        }
      },
    );
  }

  const variantShape = z.object({
    title: z.string().optional(),
    sku: z.string().optional(),
    priceMinor: z.number().int().nonnegative().describe('Price in the smallest currency unit (paise for INR)'),
    costMinor: z.number().int().optional().describe('Unit cost (COGS) — enables margin analysis & repricing'),
    inventory: z.number().int().optional(),
  });

  // --- Stores ---------------------------------------------------------------
  server.registerTool(
    'create_store',
    {
      description: 'Create a new storefront for the authenticated merchant (multi-tenant).',
      inputSchema: {
        name: z.string(),
        slug: z.string().optional(),
        currency: z.string().optional().describe('ISO currency, defaults to INR'),
        country: z.string().optional().describe('ISO country, defaults to IN'),
        ownerEmail: z.string().optional().describe('Where store-owner alerts are sent'),
        ownerPhone: z.string().optional(),
      },
    },
    tool((ctx, a: any) => commerce.stores.create(ctx, a)),
  );

  server.registerTool(
    'list_stores',
    { description: 'List all stores owned by the authenticated merchant.', inputSchema: {} },
    tool((ctx) => commerce.stores.list(ctx)),
  );

  server.registerTool(
    'get_store',
    { description: 'Fetch a single store by id.', inputSchema: { storeId: z.string() } },
    tool((ctx, a: any) => commerce.stores.get(ctx, a.storeId)),
  );

  // --- Products -------------------------------------------------------------
  server.registerTool(
    'create_product',
    {
      description: 'Add a product (with one or more variants) to a store.',
      inputSchema: {
        storeId: z.string(),
        title: z.string(),
        description: z.string().optional(),
        status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
        variants: z.array(variantShape).optional(),
      },
    },
    tool((ctx, a: any) => commerce.products.create(ctx, a)),
  );

  server.registerTool(
    'update_product',
    {
      description: 'Update a product\'s title, description, or status.',
      inputSchema: {
        productId: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
      },
    },
    tool((ctx, a: any) => commerce.products.update(ctx, a.productId, a)),
  );

  server.registerTool(
    'list_products',
    { description: 'List products in a store.', inputSchema: { storeId: z.string() } },
    tool((ctx, a: any) => commerce.products.list(ctx, a.storeId)),
  );

  // --- Customers ------------------------------------------------------------
  server.registerTool(
    'create_customer',
    {
      description: 'Create a customer record for a store.',
      inputSchema: {
        storeId: z.string(),
        name: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional().describe('E.164 phone, used for WhatsApp automation'),
      },
    },
    tool((ctx, a: any) => commerce.customers.create(ctx, a)),
  );

  const segmentEnum = z.enum(['NEW', 'ONE_TIME', 'REPEAT', 'VIP', 'AT_RISK', 'LAPSED']);

  server.registerTool(
    'list_customers',
    {
      description: 'List a store\'s customers with CRM stats (orders, lifetime spend, last order, segment). Optionally search by name/email/phone or filter by segment.',
      inputSchema: { storeId: z.string(), search: z.string().optional(), segment: segmentEnum.optional() },
    },
    tool((ctx, a: any) => commerce.customers.list(ctx, a.storeId, { search: a.search, segment: a.segment })),
  );

  server.registerTool(
    'get_customer_profile',
    {
      description: 'A 360° customer profile: lifetime value, orders, AOV, segment, loyalty, subscriptions, reviews, returns, support, and recent orders.',
      inputSchema: { customerId: z.string() },
    },
    tool((ctx, a: any) => commerce.customers.profile(ctx, a.customerId)),
  );

  server.registerTool(
    'update_customer',
    {
      description: 'Update a customer: contact details, tags, and notes (CRM).',
      inputSchema: {
        customerId: z.string(),
        name: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        tags: z.array(z.string()).optional(),
        notes: z.string().optional(),
      },
    },
    tool((ctx, a: any) => commerce.customers.update(ctx, a.customerId, a)),
  );

  server.registerTool(
    'customer_summary',
    {
      description: 'Store CRM summary: customer count, repeat rate, average lifetime value, and a segment breakdown.',
      inputSchema: { storeId: z.string() },
    },
    tool((ctx, a: any) => commerce.customers.summary(ctx, a.storeId)),
  );

  // --- Cohort intelligence --------------------------------------------------
  server.registerTool(
    'recompute_cohorts',
    {
      description: 'Re-run cohort intelligence for a store: ML micro-cohorts (fuzzy c-means over behaviour + Meta/Google attribution) + acquisition cohorts.',
      inputSchema: { storeId: z.string() },
    },
    tool((ctx, a: any) => commerce.cohorts.recompute(ctx, a.storeId)),
  );

  server.registerTool(
    'list_cohorts',
    {
      description: 'List a store\'s micro-cohorts with size, label, and signature (top channel, behaviour, value).',
      inputSchema: { storeId: z.string() },
    },
    tool((ctx, a: any) => commerce.cohorts.list(ctx, a.storeId)),
  );

  server.registerTool(
    'customer_cohorts',
    {
      description: 'The cohorts a customer belongs to (multi-membership, weighted), their acquisition source, and HOT/WARM/COLD temperature.',
      inputSchema: { customerId: z.string() },
    },
    tool((ctx, a: any) => commerce.cohorts.forCustomer(ctx, a.customerId)),
  );

  server.registerTool(
    'customer_recommendations',
    {
      description: 'Cohort-based product recommendations for a customer ("others in your cohort bought…"), excluding what they already own.',
      inputSchema: { customerId: z.string(), limit: z.number().optional() },
    },
    tool((ctx, a: any) => commerce.cohorts.recommendations(ctx, a.customerId, a.limit)),
  );

  // --- Orders ---------------------------------------------------------------
  server.registerTool(
    'list_orders',
    { description: 'List orders, optionally filtered by store.', inputSchema: { storeId: z.string().optional() } },
    tool((ctx, a: any) => commerce.orders.list(ctx, a.storeId)),
  );

  server.registerTool(
    'get_order',
    { description: 'Fetch a single order with items and payment.', inputSchema: { orderId: z.string() } },
    tool((ctx, a: any) => commerce.orders.get(ctx, a.orderId)),
  );

  server.registerTool(
    'update_order_status',
    {
      description: 'Update an order\'s fulfillment status.',
      inputSchema: {
        orderId: z.string(),
        status: z.enum(['PENDING', 'PAID', 'FULFILLED', 'CANCELLED', 'REFUNDED']),
      },
    },
    tool((ctx, a: any) => commerce.orders.updateStatus(ctx, a.orderId, a.status)),
  );

  // --- Checkout -------------------------------------------------------------
  server.registerTool(
    'checkout',
    {
      description: 'Create an order and initiate payment via the store\'s active payment provider.',
      inputSchema: {
        storeId: z.string(),
        items: z.array(z.object({ variantId: z.string(), quantity: z.number().int().positive() })),
        customerId: z.string().optional(),
        provider: z.enum(['RAZORPAY', 'GOKWIK']).optional(),
      },
    },
    tool((ctx, a: any) => commerce.payments.checkout(ctx, a)),
  );

  // --- Integrations ---------------------------------------------------------
  server.registerTool(
    'configure_payment_provider',
    {
      description: 'Configure Razorpay or GoKwik credentials for a store (encrypted at rest).',
      inputSchema: {
        storeId: z.string(),
        provider: z.enum(['RAZORPAY', 'GOKWIK']),
        credentials: z.record(z.any()).describe('Provider keys, e.g. { keyId, keySecret, webhookSecret }'),
        enabled: z.boolean().optional(),
      },
    },
    tool((ctx, a: any) => commerce.integrations.configure(ctx, a)),
  );

  server.registerTool(
    'configure_whatsapp',
    {
      description: 'Configure WhatsApp messaging credentials for a store.',
      inputSchema: {
        storeId: z.string(),
        credentials: z.record(z.any()).describe('e.g. { phoneNumberId, token }'),
        enabled: z.boolean().optional(),
      },
    },
    tool((ctx, a: any) =>
      commerce.integrations.configure(ctx, { ...a, provider: 'WHATSAPP' }),
    ),
  );

  server.registerTool(
    'send_whatsapp_message',
    {
      description: 'Send a WhatsApp message to a customer from a store.',
      inputSchema: { storeId: z.string(), to: z.string(), body: z.string() },
    },
    tool((ctx, a: any) => commerce.messaging.send(ctx, a)),
  );

  server.registerTool(
    'configure_email',
    {
      description: 'Configure the email (Resend) provider credentials for a store.',
      inputSchema: {
        storeId: z.string(),
        credentials: z.record(z.any()).describe('e.g. { apiKey, fromAddress }'),
        enabled: z.boolean().optional(),
      },
    },
    tool((ctx, a: any) => commerce.integrations.configure(ctx, { ...a, provider: 'RESEND' })),
  );

  server.registerTool(
    'configure_sms',
    {
      description: 'Configure the SMS (MSG91) provider credentials for a store.',
      inputSchema: {
        storeId: z.string(),
        credentials: z.record(z.any()).describe('e.g. { authKey, senderId }'),
        enabled: z.boolean().optional(),
      },
    },
    tool((ctx, a: any) => commerce.integrations.configure(ctx, { ...a, provider: 'MSG91' })),
  );

  server.registerTool(
    'configure_marketing',
    {
      description: 'Configure a marketing-email provider (Klaviyo/Mailchimp/Brevo) for a store.',
      inputSchema: {
        storeId: z.string(),
        provider: z.enum(['KLAVIYO', 'MAILCHIMP', 'BREVO']),
        credentials: z.record(z.any()).describe('e.g. { apiKey, listId }'),
        enabled: z.boolean().optional(),
      },
    },
    tool((ctx, a: any) => commerce.integrations.configure(ctx, a)),
  );

  server.registerTool(
    'sync_marketing',
    {
      description: 'Re-sync a store\'s customers to its enabled marketing-email providers.',
      inputSchema: { storeId: z.string() },
    },
    tool((ctx, a: any) => commerce.marketing.syncAll(ctx, a.storeId)),
  );

  // --- Notifications --------------------------------------------------------
  const eventEnum = z.enum([
    'ORDER_PLACED',
    'ORDER_PAID',
    'ORDER_STATUS_CHANGED',
    'ABANDONED_CART',
    'LOW_STOCK',
    'OUT_OF_STOCK',
  ]);
  const channelEnum = z.enum(['EMAIL', 'SMS', 'WHATSAPP']);
  const recipientEnum = z.enum(['CUSTOMER', 'STORE_OWNER']);

  server.registerTool(
    'send_notification',
    {
      description:
        'Dispatch a notification for an event across the store\'s configured channels (email/SMS/WhatsApp) to customers and/or the store owner.',
      inputSchema: {
        storeId: z.string(),
        event: eventEnum,
        data: z.record(z.any()).describe('Template variables, e.g. { customerEmail, orderNumber }'),
        recipientType: recipientEnum.optional(),
      },
    },
    tool((ctx, a: any) => commerce.notifications.notify(ctx, a)),
  );

  server.registerTool(
    'list_notification_preferences',
    {
      description: 'List effective notification channel preferences for a store.',
      inputSchema: { storeId: z.string() },
    },
    tool((ctx, a: any) => commerce.notifications.listPreferences(ctx, a.storeId)),
  );

  server.registerTool(
    'set_notification_preference',
    {
      description: 'Set which channels fire for an (event, recipient) in a store.',
      inputSchema: {
        storeId: z.string(),
        event: eventEnum,
        recipientType: recipientEnum,
        channels: z.array(channelEnum),
        enabled: z.boolean().optional(),
      },
    },
    tool((ctx, a: any) => commerce.notifications.setPreference(ctx, a)),
  );

  // --- Carts & recovery -----------------------------------------------------
  server.registerTool(
    'create_cart',
    {
      description: 'Create a shopping cart, optionally with items and a customer/contact.',
      inputSchema: {
        storeId: z.string(),
        customerId: z.string().optional(),
        contactEmail: z.string().optional(),
        contactPhone: z.string().optional(),
        items: z.array(z.object({ variantId: z.string(), quantity: z.number().int().positive() })).optional(),
      },
    },
    tool((ctx, a: any) => commerce.carts.createCart(ctx, a)),
  );

  server.registerTool(
    'add_to_cart',
    {
      description: 'Add (or increment) a variant in a cart.',
      inputSchema: { cartId: z.string(), variantId: z.string(), quantity: z.number().int().positive() },
    },
    tool((ctx, a: any) => commerce.carts.addItem(ctx, a.cartId, a)),
  );

  server.registerTool(
    'list_carts',
    {
      description: 'List carts, optionally filtered by store and status.',
      inputSchema: {
        storeId: z.string().optional(),
        status: z.enum(['ACTIVE', 'ABANDONED', 'CONVERTED', 'RECOVERED']).optional(),
      },
    },
    tool((ctx, a: any) => commerce.carts.listCarts(ctx, a)),
  );

  server.registerTool(
    'checkout_cart',
    {
      description: 'Check out a cart, creating an order + payment linked to it.',
      inputSchema: { cartId: z.string(), provider: z.enum(['RAZORPAY', 'GOKWIK']).optional() },
    },
    tool((ctx, a: any) => commerce.carts.checkoutCart(ctx, a.cartId, { provider: a.provider })),
  );

  // --- Analytics ------------------------------------------------------------
  const rangeSchema = {
    storeId: z.string().optional(),
    from: z.string().optional().describe('ISO date; defaults to 30 days ago'),
    to: z.string().optional().describe('ISO date; defaults to now'),
  };

  server.registerTool(
    'get_analytics_summary',
    {
      description: 'KPI summary: revenue, orders, AOV, new customers, cart conversion, over a date range.',
      inputSchema: rangeSchema,
    },
    tool((ctx, a: any) => commerce.analytics.summary(ctx, a)),
  );

  server.registerTool(
    'get_top_products',
    {
      description: 'Best-selling products by revenue/units over a date range.',
      inputSchema: { ...rangeSchema, limit: z.number().int().positive().optional() },
    },
    tool((ctx, a: any) => commerce.analytics.topProducts(ctx, a)),
  );

  // --- Stock ----------------------------------------------------------------
  server.registerTool(
    'get_stock_status',
    {
      description: 'Get red/amber/green stock health (days-of-cover) for every variant in a store.',
      inputSchema: { storeId: z.string() },
    },
    tool((ctx, a: any) => commerce.stock.getStockStatus(ctx, a.storeId)),
  );

  // --- Shipping -------------------------------------------------------------
  server.registerTool(
    'create_shipment',
    {
      description: 'Create a shipment for an order via the store\'s active courier (Delhivery).',
      inputSchema: {
        orderId: z.string(),
        to: z
          .object({
            name: z.string().optional(),
            phone: z.string().optional(),
            line1: z.string().optional(),
            line2: z.string().optional(),
            city: z.string().optional(),
            state: z.string().optional(),
            pincode: z.string().optional(),
            country: z.string().optional(),
          })
          .describe('Delivery address (line1 or pincode required)'),
        weightGrams: z.number().int().positive().optional(),
      },
    },
    tool((ctx, a: any) => commerce.shipping.createShipment(ctx, a)),
  );

  server.registerTool(
    'list_shipments',
    {
      description: 'List shipments, optionally filtered by store and status.',
      inputSchema: {
        storeId: z.string().optional(),
        status: z
          .enum(['PENDING', 'MANIFESTED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RTO', 'CANCELLED', 'FAILED'])
          .optional(),
      },
    },
    tool((ctx, a: any) => commerce.shipping.listShipments(ctx, a)),
  );

  // --- Reviews --------------------------------------------------------------
  server.registerTool(
    'list_reviews',
    {
      description: 'List product reviews, optionally filtered by store, status, or product.',
      inputSchema: {
        storeId: z.string().optional(),
        status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
        productId: z.string().optional(),
      },
    },
    tool((ctx, a: any) => commerce.reviews.list(ctx, a)),
  );

  server.registerTool(
    'moderate_review',
    {
      description: 'Approve or reject a product review.',
      inputSchema: { reviewId: z.string(), status: z.enum(['APPROVED', 'REJECTED']) },
    },
    tool((ctx, a: any) => commerce.reviews.moderate(ctx, a.reviewId, a.status)),
  );

  // --- Bundles / frequently bought together ---------------------------------
  server.registerTool(
    'list_bundles',
    {
      description: 'List conversion bundles (priced, with savings), optionally filtered by store.',
      inputSchema: { storeId: z.string().optional() },
    },
    tool((ctx, a: any) => commerce.offers.listBundles(ctx, a.storeId)),
  );

  server.registerTool(
    'create_bundle',
    {
      description:
        'Create a "buy together & save" bundle. The saving auto-applies at checkout when a cart contains all of its variants. Needs at least two items.',
      inputSchema: {
        storeId: z.string(),
        title: z.string(),
        description: z.string().optional(),
        discountType: z.enum(['PERCENT', 'FIXED']).optional(),
        discountValue: z.number().optional(),
        active: z.boolean().optional(),
        items: z.array(z.object({ variantId: z.string(), quantity: z.number().optional() })),
      },
    },
    tool((ctx, a: any) => commerce.offers.createBundle(ctx, a)),
  );

  // --- Store design / page builder ------------------------------------------
  const pageSection = z.object({
    id: z.string().optional(),
    type: z.enum(['hero', 'rich_text', 'image', 'product_grid', 'featured_product', 'faq']),
    data: z.record(z.any()).optional(),
  });

  server.registerTool(
    'list_pages',
    { description: 'List the storefront pages of a store (builder pages).', inputSchema: { storeId: z.string() } },
    tool((ctx, a: any) => commerce.pages.list(ctx, a.storeId)),
  );

  server.registerTool(
    'create_page',
    {
      description:
        'Create a storefront page from typed sections (hero, rich_text, image, product_grid, featured_product, faq). slug "home" is the landing page. Status DRAFT unless PUBLISHED is given.',
      inputSchema: {
        storeId: z.string(),
        slug: z.string(),
        title: z.string(),
        sections: z.array(pageSection).optional(),
        metaTitle: z.string().optional(),
        metaDescription: z.string().optional(),
        status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
      },
    },
    tool((ctx, a: any) => commerce.pages.create(ctx, a)),
  );

  server.registerTool(
    'update_page',
    {
      description: 'Update a storefront page (title, slug, sections, SEO, or status).',
      inputSchema: {
        pageId: z.string(),
        slug: z.string().optional(),
        title: z.string().optional(),
        sections: z.array(pageSection).optional(),
        metaTitle: z.string().optional(),
        metaDescription: z.string().optional(),
        status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
      },
    },
    tool((ctx, a: any) => commerce.pages.update(ctx, a.pageId, a)),
  );

  server.registerTool(
    'publish_page',
    {
      description: 'Publish or unpublish a storefront page.',
      inputSchema: { pageId: z.string(), status: z.enum(['DRAFT', 'PUBLISHED']) },
    },
    tool((ctx, a: any) => commerce.pages.setStatus(ctx, a.pageId, a.status)),
  );

  server.registerTool(
    'set_store_theme',
    {
      description: 'Set the store visual theme (hex colors + logo text).',
      inputSchema: {
        storeId: z.string(),
        primaryColor: z.string().optional(),
        accentColor: z.string().optional(),
        logoText: z.string().optional(),
      },
    },
    tool((ctx, a: any) => commerce.pages.setTheme(ctx, a)),
  );

  // --- Returns / RMA --------------------------------------------------------
  server.registerTool(
    'list_returns',
    {
      description: 'List returns/RMAs, optionally filtered by store or status.',
      inputSchema: {
        storeId: z.string().optional(),
        status: z.enum(['REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'REFUNDED', 'CANCELLED']).optional(),
      },
    },
    tool((ctx, a: any) => commerce.returns.list(ctx, a)),
  );

  server.registerTool(
    'update_return',
    {
      description: 'Advance a return: approve, reject, mark received, refund, or cancel.',
      inputSchema: {
        returnId: z.string(),
        action: z.enum(['approve', 'reject', 'receive', 'refund', 'cancel']),
        note: z.string().optional(),
        amountMinor: z.number().optional(),
      },
    },
    tool((ctx, a: any) => {
      switch (a.action) {
        case 'approve':
          return commerce.returns.approve(ctx, a.returnId, a.note);
        case 'reject':
          return commerce.returns.reject(ctx, a.returnId, a.note);
        case 'receive':
          return commerce.returns.markReceived(ctx, a.returnId);
        case 'refund':
          return commerce.returns.refund(ctx, a.returnId, a.amountMinor);
        case 'cancel':
          return commerce.returns.cancel(ctx, a.returnId);
        default:
          throw new Error('Unknown action');
      }
    }),
  );

  // --- Loyalty / rewards ----------------------------------------------------
  server.registerTool(
    'get_loyalty_program',
    { description: 'Get the loyalty/rewards program config for a store.', inputSchema: { storeId: z.string() } },
    tool((ctx, a: any) => commerce.loyalty.getProgram(ctx, a.storeId)),
  );

  server.registerTool(
    'set_loyalty_program',
    {
      description: 'Configure the loyalty program (earn rate, redemption value, minimum, signup bonus, tiers).',
      inputSchema: {
        storeId: z.string(),
        enabled: z.boolean().optional(),
        pointsPerCurrencyUnit: z.number().optional(),
        redeemValueMinorPerPoint: z.number().optional(),
        minRedeemPoints: z.number().optional(),
        signupBonus: z.number().optional(),
        tiers: z.array(z.object({ name: z.string(), minPoints: z.number() })).optional(),
      },
    },
    tool((ctx, a: any) => commerce.loyalty.setProgram(ctx, a)),
  );

  server.registerTool(
    'adjust_loyalty_points',
    {
      description: "Manually add or remove points from a customer's loyalty balance.",
      inputSchema: {
        customerId: z.string(),
        points: z.number(),
        note: z.string().optional(),
        type: z.enum(['EARN', 'REDEEM', 'SIGNUP', 'ADJUST']).optional(),
      },
    },
    tool((ctx, a: any) => commerce.loyalty.award(ctx, a.customerId, a.points, a.note, a.type)),
  );

  // --- Subscriptions --------------------------------------------------------
  const intervalEnum = z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY']);

  server.registerTool(
    'list_subscriptions',
    {
      description: 'List subscriptions, optionally filtered by store or status.',
      inputSchema: { storeId: z.string().optional(), status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED']).optional() },
    },
    tool((ctx, a: any) => commerce.subscriptions.list(ctx, a)),
  );

  server.registerTool(
    'create_subscription',
    {
      description: 'Create a recurring "subscribe & save" subscription for a customer (by email or id).',
      inputSchema: {
        storeId: z.string(),
        variantId: z.string(),
        interval: intervalEnum,
        quantity: z.number().optional(),
        email: z.string().optional(),
        customerId: z.string().optional(),
        discountPercent: z.number().optional(),
      },
    },
    tool((ctx, a: any) => commerce.subscriptions.create(ctx, a)),
  );

  server.registerTool(
    'update_subscription_status',
    {
      description: 'Pause, resume (ACTIVE), or cancel a subscription.',
      inputSchema: { subscriptionId: z.string(), status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED']) },
    },
    tool((ctx, a: any) => commerce.subscriptions.setStatus(ctx, a.subscriptionId, a.status)),
  );

  // --- SEO & images ---------------------------------------------------------
  server.registerTool(
    'seo_audit',
    {
      description: 'Run an SEO + performance audit of a store: a health score and a list of on-page issues.',
      inputSchema: { storeId: z.string() },
    },
    tool((ctx, a: any) => commerce.seo.audit(ctx, a.storeId)),
  );

  server.registerTool(
    'optimize_images',
    {
      description: 'Compress all not-yet-optimized images in a store and report the bytes saved.',
      inputSchema: { storeId: z.string() },
    },
    tool((ctx, a: any) => commerce.images.optimizeAll(ctx, a.storeId)),
  );

  // --- Pricing intelligence -------------------------------------------------
  server.registerTool(
    'analyze_pricing',
    {
      description: 'Margin + competitor analysis for a store, with a recommended price per variant.',
      inputSchema: { storeId: z.string() },
    },
    tool((ctx, a: any) => commerce.pricing.analyze(ctx, a.storeId)),
  );

  server.registerTool(
    'run_repricing',
    {
      description: 'Compute repricing for a store (preview by default). Pass apply=true to write the new prices.',
      inputSchema: { storeId: z.string(), apply: z.boolean().optional() },
    },
    tool((ctx, a: any) => commerce.pricing.reprice(ctx, a.storeId, { apply: a.apply })),
  );

  server.registerTool(
    'add_competitor_price',
    {
      description: 'Track a competitor price for one of our variants (feeds margin analysis + repricing).',
      inputSchema: {
        variantId: z.string(),
        competitorName: z.string(),
        priceMinor: z.number(),
        url: z.string().optional(),
        inStock: z.boolean().optional(),
      },
    },
    tool((ctx, a: any) => commerce.pricing.addCompetitor(ctx, a)),
  );

  server.registerTool(
    'set_pricing_rule',
    {
      description: 'Configure automatic repricing: strategy + how much to undercut, bounded by a minimum-margin floor (never sells at a loss).',
      inputSchema: {
        storeId: z.string(),
        enabled: z.boolean().optional(),
        strategy: z.enum(['MATCH_LOWEST', 'BEAT_LOWEST', 'FIXED_MARGIN']).optional(),
        adjustValue: z.number().optional().describe('Undercut amount (percent or minor units), or target margin % for FIXED_MARGIN'),
        adjustIsPercent: z.boolean().optional(),
        minMarginPercent: z.number().optional().describe('Never price below the margin floor'),
        roundTo99: z.boolean().optional().describe('Charm pricing (prices end in .99)'),
      },
    },
    tool((ctx, a: any) => commerce.pricing.setRule(ctx, a)),
  );

  // --- Feature setup (storefront offers, SEO, support, shipping) -------------
  server.registerTool(
    'set_subscription_settings',
    {
      description: 'Set up the storefront "subscribe & save" offer: enable it, the discount, and the cadences shoppers can pick.',
      inputSchema: {
        storeId: z.string(),
        enabled: z.boolean().optional(),
        discountPercent: z.number().optional(),
        intervals: z.array(z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY'])).optional(),
      },
    },
    tool((ctx, a: any) => commerce.subscriptions.setSettings(ctx, a)),
  );

  server.registerTool(
    'set_seo_settings',
    {
      description: 'Configure store SEO defaults: the page-title template, default meta description, and whether search engines may index the store.',
      inputSchema: {
        storeId: z.string(),
        titleTemplate: z.string().optional().describe('Uses {title} and {storeName}'),
        defaultDescription: z.string().optional(),
        indexable: z.boolean().optional(),
      },
    },
    tool((ctx, a: any) => commerce.seo.setSettings(ctx, a)),
  );

  server.registerTool(
    'configure_support_bot',
    {
      description: 'Set up the storefront sales & support chatbot: enable it and set its name, greeting, and persona/instructions.',
      inputSchema: {
        storeId: z.string(),
        enabled: z.boolean().optional(),
        displayName: z.string().optional(),
        greeting: z.string().optional(),
        persona: z.string().optional().describe('Tone, policies, what to emphasize'),
      },
    },
    tool((ctx, a: any) => commerce.customerSupport.setConfig(ctx, a)),
  );

  server.registerTool(
    'configure_shipping',
    {
      description: 'Configure the shipping courier (Delhivery) credentials for a store, so shipments can be created.',
      inputSchema: {
        storeId: z.string(),
        credentials: z.record(z.any()).describe('e.g. { token, pickupName, webhookSecret }'),
        enabled: z.boolean().optional(),
      },
    },
    tool((ctx, a: any) => commerce.integrations.configure(ctx, { ...a, provider: 'DELHIVERY' })),
  );

  // --- Team / members -------------------------------------------------------
  const roleEnum = z.enum(['OWNER', 'ADMIN', 'STAFF']);

  server.registerTool(
    'list_members',
    { description: 'List the members (users + roles) of the workspace.', inputSchema: {} },
    tool((ctx) => commerce.members.listMembers(ctx)),
  );

  server.registerTool(
    'invite_user',
    {
      description: 'Invite a user to the workspace with a role. Returns an invite link token.',
      inputSchema: { email: z.string(), role: roleEnum },
    },
    tool((ctx, a: any) => commerce.members.createInvite(ctx, a)),
  );

  // --- API keys -------------------------------------------------------------
  server.registerTool(
    'create_api_key',
    {
      description: 'Create a new API key for the merchant. The raw secret is returned once.',
      inputSchema: { name: z.string(), scopes: z.array(z.string()).optional() },
    },
    tool((ctx, a: any) => commerce.apiKeys.create(ctx, a)),
  );
}
