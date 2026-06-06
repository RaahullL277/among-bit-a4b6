import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCommerce, type TenantContext } from '@acp/core';

/**
 * Registers every commerce tool on an MCP server. Each tool is a thin wrapper
 * over the same @acp/core service layer the REST API uses — so an agent and a
 * dashboard drive identical behavior. `getContext` resolves the TenantContext
 * for the authenticated caller (from the API key).
 */
export function registerTools(
  server: McpServer,
  getContext: () => Promise<TenantContext>,
) {
  const commerce = getCommerce();

  const ok = (data: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  });

  // Wraps a handler with context resolution + uniform error reporting.
  const tool =
    <A>(handler: (ctx: TenantContext, args: A) => Promise<unknown>) =>
    async (args: A) => {
      try {
        const ctx = await getContext();
        return ok(await handler(ctx, args));
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
        };
      }
    };

  const variantShape = z.object({
    title: z.string().optional(),
    sku: z.string().optional(),
    priceMinor: z.number().int().nonnegative().describe('Price in the smallest currency unit (paise for INR)'),
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
