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
      description: 'List ready-made store design templates (theme + storefront layout, with the customer segment each targets). Optionally filter by category: fashion, lifestyle, cosmetics, jewellery, kitchenware, perfumes.',
      inputSchema: { category: z.enum(['fashion', 'lifestyle', 'cosmetics', 'jewellery', 'kitchenware', 'perfumes']).optional() },
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
    options: z.record(z.string()).optional().describe('Option map, e.g. { Size: "M", Color: "Red" }'),
    barcode: z.string().optional(),
    weightGrams: z.number().int().optional(),
  });

  // Merchandising fields shared by create/update product.
  const merchShape = {
    brand: z.string().nullable().optional(),
    productType: z.string().nullable().optional().describe('e.g. "Ring", "Smartphone", "Serum", "Sensor"'),
    countryOfOrigin: z.string().nullable().optional(),
    ingredients: z.string().nullable().optional().describe('Cosmetics / wellness'),
    warrantyMonths: z.number().int().nullable().optional(),
    warrantyTerms: z.string().nullable().optional(),
    moq: z.number().int().nullable().optional().describe('B2B minimum order quantity'),
    leadTimeDays: z.number().int().nullable().optional(),
  };

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

  server.registerTool(
    'get_store_tax_identity',
    {
      description: 'The seller tax identity printed on GST invoices: legal name, GSTIN, PAN, registered address + state code, and the invoice / credit-note number-series prefixes.',
      inputSchema: { storeId: z.string() },
    },
    tool((ctx, a: any) => commerce.stores.getTaxIdentity(ctx, a.storeId)),
  );

  server.registerTool(
    'set_store_tax_identity',
    {
      description: 'Set the seller tax identity for GST tax invoices: registered legal name, GSTIN (15-char; the state code is derived from it), PAN, the registered place-of-business address (used as the seller address and to decide CGST+SGST vs IGST), and optional invoice/credit-note number prefixes.',
      inputSchema: {
        storeId: z.string(),
        legalName: z.string().nullable().optional(),
        gstin: z.string().nullable().optional().describe('15-char GSTIN; presence makes invoices "Tax Invoices" with split GST'),
        pan: z.string().nullable().optional(),
        taxAddressLine1: z.string().nullable().optional(),
        taxAddressLine2: z.string().nullable().optional(),
        taxCity: z.string().nullable().optional(),
        taxState: z.string().nullable().optional().describe('State name or 2-digit GST state code'),
        taxStateCode: z.string().nullable().optional(),
        taxPincode: z.string().nullable().optional(),
        invoicePrefix: z.string().optional().describe('Invoice number series prefix, e.g. "INV"'),
        creditNotePrefix: z.string().optional().describe('Credit-note series prefix, e.g. "CN"'),
      },
    },
    tool((ctx, a: any) => commerce.stores.setTaxIdentity(ctx, a.storeId, a)),
  );

  // --- Listing agent (photo → copy → price/discount/stock → publish) --------
  server.registerTool(
    'get_listing_config',
    {
      description: 'The listing agent\'s harness for a store: the master prompt, brand voice, tone, content rules, and photo-enhancement preferences.',
      inputSchema: { storeId: z.string() },
    },
    tool((ctx, a: any) => commerce.listing.getConfig(ctx, a.storeId)),
  );

  server.registerTool(
    'set_listing_config',
    {
      description: 'Customise the listing agent harness: override the master prompt, set brand voice / tone / default category, content rules, target description length, and photo prefs (background cleanup, square crop, auto alt-text).',
      inputSchema: {
        storeId: z.string(),
        masterPrompt: z.string().nullable().optional(),
        brandVoice: z.string().nullable().optional(),
        tone: z.string().nullable().optional(),
        categoryHint: z.string().nullable().optional(),
        contentRules: z.array(z.string()).optional(),
        descWords: z.number().int().optional(),
        enhanceBackground: z.boolean().optional(),
        squareCrop: z.boolean().optional(),
        autoAltText: z.boolean().optional(),
      },
    },
    tool((ctx, a: any) => commerce.listing.setConfig(ctx, a)),
  );

  server.registerTool(
    'enhance_product_photo',
    {
      description: 'Photo-enhancement sub-agent: clean up / crop a snapped product photo per the harness and return an enhanced image URL + alt text.',
      inputSchema: { storeId: z.string(), imageUrl: z.string(), hint: z.string().optional() },
    },
    tool((ctx, a: any) => commerce.listing.enhancePhoto(ctx, a)),
  );

  server.registerTool(
    'write_product_content',
    {
      description: 'Content-writing sub-agent: generate a product title, benefit-led description, bullets, SEO meta, and tags from a short hint + price, in the store\'s brand voice.',
      inputSchema: { storeId: z.string(), hint: z.string().optional(), priceMinor: z.number().int().optional() },
    },
    tool((ctx, a: any) => commerce.listing.writeContent(ctx, a)),
  );

  server.registerTool(
    'draft_listing',
    {
      description: 'Listing agent: from a product photo (+ optional hint) run both sub-agents and return a ready-to-edit draft (enhanced photo + title/description/bullets/SEO/tags). The owner then sets price/discount/stock and calls publish_listing.',
      inputSchema: { storeId: z.string(), imageUrl: z.string(), hint: z.string().optional(), category: z.string().optional() },
    },
    tool((ctx, a: any) => commerce.listing.draft(ctx, a)),
  );

  server.registerTool(
    'publish_listing',
    {
      description: 'Publish a listing as a live product: creates the product + variant (price, optional discount → struck-through "was" price, stock) and attaches the enhanced photo.',
      inputSchema: {
        storeId: z.string(),
        imageUrl: z.string().optional(),
        title: z.string(),
        description: z.string().optional(),
        metaTitle: z.string().optional(),
        metaDescription: z.string().optional(),
        tags: z.array(z.string()).optional(),
        alt: z.string().optional(),
        priceMinor: z.number().int().nonnegative().describe('What the customer pays, in minor units (paise)'),
        discountPercent: z.number().min(0).max(99).optional().describe('Shows a struck-through "was" price'),
        stock: z.number().int().nonnegative().optional(),
        status: z.enum(['DRAFT', 'ACTIVE']).optional(),
      },
    },
    tool((ctx, a: any) => commerce.listing.publish(ctx, a)),
  );

  // --- Products -------------------------------------------------------------
  server.registerTool(
    'create_product',
    {
      description: 'Add a product (with one or more variants) to a store. Set hsnCode + gstRateBps for GST tax invoices.',
      inputSchema: {
        storeId: z.string(),
        title: z.string(),
        description: z.string().optional(),
        status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
        hsnCode: z.string().nullable().optional().describe('HSN/SAC code printed per line on the GST invoice'),
        gstRateBps: z.number().int().min(0).max(10000).nullable().optional().describe('Per-product GST rate in basis points (1800=18%); falls back to the store rate'),
        ...merchShape,
        variants: z.array(variantShape).optional(),
      },
    },
    tool((ctx, a: any) => commerce.products.create(ctx, a)),
  );

  server.registerTool(
    'update_product',
    {
      description: 'Update a product\'s title, description, status, tags, GST classification, or merchandising fields (brand, productType, warranty, etc.).',
      inputSchema: {
        productId: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
        tags: z.array(z.string()).optional(),
        hsnCode: z.string().nullable().optional(),
        gstRateBps: z.number().int().min(0).max(10000).nullable().optional(),
        ...merchShape,
      },
    },
    tool((ctx, a: any) => commerce.products.update(ctx, a.productId, a)),
  );

  server.registerTool(
    'update_variant',
    {
      description: 'Edit an existing variant\'s price, compare-at ("was") price, cost, title, or SKU. compareAt must be ≥ price.',
      inputSchema: {
        variantId: z.string(),
        priceMinor: z.number().int().nonnegative().optional(),
        compareAtMinor: z.number().int().nonnegative().nullable().optional(),
        costMinor: z.number().int().nonnegative().optional(),
        title: z.string().optional(),
        sku: z.string().nullable().optional(),
      },
    },
    tool((ctx, a: any) => commerce.products.updateVariant(ctx, a.variantId, a)),
  );

  server.registerTool(
    'list_products',
    { description: 'List products in a store.', inputSchema: { storeId: z.string() } },
    tool((ctx, a: any) => commerce.products.list(ctx, a.storeId)),
  );

  server.registerTool(
    'add_variant',
    {
      description: 'Add a variant to an existing product (build a size/colour matrix). `options` maps option name → value, e.g. { Size: "M", Color: "Red" }.',
      inputSchema: {
        productId: z.string(),
        title: z.string().optional(),
        sku: z.string().optional(),
        priceMinor: z.number().int().nonnegative(),
        compareAtMinor: z.number().int().optional(),
        inventory: z.number().int().optional(),
        options: z.record(z.string()).optional(),
        barcode: z.string().optional(),
        weightGrams: z.number().int().optional(),
      },
    },
    tool((ctx, a: any) => commerce.products.addVariant(ctx, a.productId, a)),
  );

  // --- Catalog merchandising (options, attributes, categories, assets, B2B) ---
  server.registerTool(
    'set_product_options',
    {
      description: 'Define a product\'s variant option axes (e.g. Size: [S,M,L], Colour: [Red,Blue]). Buyers pick these on the storefront; each combination resolves to a variant via its `options` map.',
      inputSchema: { productId: z.string(), options: z.array(z.object({ name: z.string(), values: z.array(z.string()) })) },
    },
    tool((ctx, a: any) => commerce.catalog.setOptions(ctx, a.productId, a.options)),
  );

  server.registerTool(
    'set_product_attributes',
    {
      description: 'Set a product\'s spec attributes (material, RAM, net weight, ingredients, dosage…). Mark `filterable` to surface it as a storefront facet.',
      inputSchema: { productId: z.string(), attributes: z.array(z.object({ name: z.string(), value: z.string(), unit: z.string().optional(), filterable: z.boolean().optional() })) },
    },
    tool((ctx, a: any) => commerce.catalog.setAttributes(ctx, a.productId, a.attributes)),
  );

  server.registerTool(
    'list_collections',
    { description: 'List a store\'s collections (categories) with product counts.', inputSchema: { storeId: z.string() } },
    tool((ctx, a: any) => commerce.catalog.listCollections(ctx, a.storeId)),
  );

  server.registerTool(
    'create_collection',
    {
      description: 'Create a collection (category) for a store.',
      inputSchema: { storeId: z.string(), title: z.string(), handle: z.string().optional(), description: z.string().optional(), imageUrl: z.string().optional() },
    },
    tool((ctx, a: any) => commerce.catalog.createCollection(ctx, a)),
  );

  server.registerTool(
    'set_product_collections',
    {
      description: 'Set which collections (categories) a product belongs to (replaces the set).',
      inputSchema: { productId: z.string(), collectionIds: z.array(z.string()) },
    },
    tool((ctx, a: any) => commerce.catalog.setProductCollections(ctx, a.productId, a.collectionIds)),
  );

  server.registerTool(
    'add_product_image',
    {
      description: 'Attach an image to a product (and optionally a variant). The first image becomes the primary (card/hero) automatically; set isPrimary to override.',
      inputSchema: { storeId: z.string(), productId: z.string(), url: z.string(), alt: z.string().optional(), variantId: z.string().optional(), isPrimary: z.boolean().optional() },
    },
    tool((ctx, a: any) => commerce.images.create(ctx, a)),
  );

  server.registerTool(
    'list_product_images',
    { description: 'List a product\'s images in display order (primary first).', inputSchema: { productId: z.string() } },
    tool((_ctx, a: any) => commerce.images.productImages(a.productId)),
  );

  server.registerTool(
    'set_primary_image',
    { description: 'Make an image the product\'s primary (card/hero) image.', inputSchema: { imageId: z.string() } },
    tool((ctx, a: any) => commerce.images.setPrimary(ctx, a.imageId)),
  );

  server.registerTool(
    'reorder_product_images',
    { description: 'Reorder a product\'s gallery to the given image-id order.', inputSchema: { productId: z.string(), orderedIds: z.array(z.string()) } },
    tool((ctx, a: any) => commerce.images.reorder(ctx, a.productId, a.orderedIds)),
  );

  server.registerTool(
    'add_product_asset',
    {
      description: 'Attach a document to a product: a datasheet, quality/hallmark certificate, size chart, or manual.',
      inputSchema: { productId: z.string(), type: z.enum(['DATASHEET', 'CERTIFICATE', 'SIZE_CHART', 'MANUAL', 'OTHER']), url: z.string(), title: z.string().optional() },
    },
    tool((ctx, a: any) => commerce.catalog.addAsset(ctx, a)),
  );

  server.registerTool(
    'set_price_tiers',
    {
      description: 'Set B2B quantity price-breaks for a variant: at/above each minQuantity, charge priceMinor per unit. Applied automatically at checkout.',
      inputSchema: { variantId: z.string(), tiers: z.array(z.object({ minQuantity: z.number().int().positive(), priceMinor: z.number().int().nonnegative() })) },
    },
    tool((ctx, a: any) => commerce.catalog.setPriceTiers(ctx, a.variantId, a.tiers)),
  );

  // --- Discount / coupon codes ----------------------------------------------
  server.registerTool(
    'create_discount',
    {
      description: 'Create a storefront coupon code: percent or fixed off, with optional minimum spend, redemption cap, and validity window. Shoppers enter it at checkout.',
      inputSchema: {
        storeId: z.string(),
        code: z.string().describe('e.g. WELCOME10'),
        type: z.enum(['PERCENT', 'FIXED']).optional(),
        value: z.number().int().positive().describe('PERCENT: 1–100 · FIXED: minor units off'),
        minSpendMinor: z.number().int().nonnegative().optional(),
        maxRedemptions: z.number().int().positive().nullable().optional(),
        startsAt: z.string().optional(),
        expiresAt: z.string().optional(),
        active: z.boolean().optional(),
      },
    },
    tool((ctx, a: any) => commerce.discounts.create(ctx, a)),
  );

  server.registerTool(
    'list_discounts',
    { description: 'List a store\'s discount codes with usage counts.', inputSchema: { storeId: z.string() } },
    tool((ctx, a: any) => commerce.discounts.list(ctx, a.storeId)),
  );

  server.registerTool(
    'set_discount_active',
    { description: 'Enable or disable a discount code.', inputSchema: { id: z.string(), active: z.boolean() } },
    tool((ctx, a: any) => commerce.discounts.setActive(ctx, a.id, a.active)),
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
    'set_customer_consent',
    {
      description: 'Record or withdraw a customer\'s marketing (promotional) consent. Withdrawing also unsubscribes them, excluding them from engagement sends. Transactional order notices are unaffected.',
      inputSchema: { customerId: z.string(), consent: z.boolean() },
    },
    tool((ctx, a: any) => commerce.customers.setMarketingConsent(ctx, a.customerId, a.consent)),
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
    'cohort_schedule',
    {
      description: 'The store\'s automatic cohort-recompute cadence (nightly ≥10k daily visitors, weekly ≥1k, monthly otherwise), its avg daily visitors, and when it last/next refreshes.',
      inputSchema: { storeId: z.string() },
    },
    tool((ctx, a: any) => commerce.cohorts.scheduleStatus(ctx, a.storeId)),
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

  // --- Engagement automation ------------------------------------------------
  const ENG_TRIGGER = z.enum([
    'NEW_IN_STOCK', 'BEST_SELLING', 'SLOW_MOVING', 'LOW_STOCK', 'BACK_IN_STOCK',
    'DISCOUNT', 'FESTIVE_DISCOUNT', 'ABANDONED_CART', 'COHORT_OFFER',
  ]);
  const ENG_CHANNEL = z.enum(['EMAIL', 'SMS', 'WHATSAPP']);

  server.registerTool(
    'list_engagement_templates',
    {
      description: 'List the engagement template library (5 variants per channel) for triggers like new-in-stock, low-stock, back-in-stock, discounts, festive, abandoned-cart and cohort offers. Filter by trigger/channel.',
      inputSchema: { trigger: ENG_TRIGGER.optional(), channel: ENG_CHANNEL.optional() },
    },
    tool(async (_ctx, a: any) => commerce.engagement.listTemplates({ trigger: a.trigger, channel: a.channel })),
  );

  server.registerTool(
    'setup_engagement_defaults',
    {
      description: 'Turn on a recommended set of engagement automations (every trigger enabled on one channel) plus a default frequency policy.',
      inputSchema: { storeId: z.string(), channel: ENG_CHANNEL.optional() },
    },
    tool((ctx, a: any) => commerce.engagement.setupDefaults(ctx, a.storeId, a.channel)),
  );

  server.registerTool(
    'configure_engagement_campaign',
    {
      description: 'Create/update one engagement automation (a trigger on a channel). Optionally pin a templateKey, narrow by temperatures (HOT/WARM/COLD) or a cohortKey, set priority, and enable/disable.',
      inputSchema: {
        storeId: z.string(),
        trigger: ENG_TRIGGER,
        channel: ENG_CHANNEL,
        enabled: z.boolean().optional(),
        templateKey: z.string().optional(),
        temperatures: z.array(z.enum(['HOT', 'WARM', 'COLD'])).optional(),
        cohortKey: z.string().optional(),
        priority: z.number().optional(),
      },
    },
    tool((ctx, a: any) => commerce.engagement.setCampaign(ctx, a)),
  );

  server.registerTool(
    'list_engagement_campaigns',
    { description: 'List a store\'s configured engagement automations.', inputSchema: { storeId: z.string() } },
    tool((ctx, a: any) => commerce.engagement.listCampaigns(ctx, a.storeId)),
  );

  server.registerTool(
    'get_engagement_policy',
    { description: 'Get the messaging-frequency policy (per-temperature 7-day caps, daily cap, min gap, quiet hours).', inputSchema: { storeId: z.string() } },
    tool((ctx, a: any) => commerce.engagement.getPolicy(ctx, a.storeId)),
  );

  server.registerTool(
    'set_engagement_policy',
    {
      description: 'Tune the frequency-adjustment agent: how many promo messages HOT/WARM/COLD customers get per 7 days, the per-day cap, minimum hours between sends, and the quiet-hours window.',
      inputSchema: {
        storeId: z.string(),
        enabled: z.boolean().optional(),
        hotMaxPer7Days: z.number().optional(),
        warmMaxPer7Days: z.number().optional(),
        coldMaxPer7Days: z.number().optional(),
        perCustomerDailyCap: z.number().optional(),
        minHoursBetween: z.number().optional(),
        quietStartHour: z.number().optional(),
        quietEndHour: z.number().optional(),
      },
    },
    tool((ctx, a: any) => commerce.engagement.setPolicy(ctx, a)),
  );

  server.registerTool(
    'preview_engagement_message',
    {
      description: 'Preview the hyper-personalised message a customer would receive for a trigger/channel (picks a template variant by their temperature, fills name + cohort recommendations). No send.',
      inputSchema: { storeId: z.string(), customerId: z.string(), trigger: ENG_TRIGGER, channel: ENG_CHANNEL, templateKey: z.string().optional() },
    },
    tool((ctx, a: any) => commerce.engagement.preview(ctx, a)),
  );

  server.registerTool(
    'run_engagement',
    {
      description: 'Run engagement automations for a store. Builds audiences for each enabled trigger, dedups so each customer gets only their single highest-priority message, applies temperature frequency caps, and sends (or simulates with dryRun). Returns sent/suppressed/skipped counts.',
      inputSchema: { storeId: z.string(), dryRun: z.boolean().optional(), triggers: z.array(ENG_TRIGGER).optional() },
    },
    tool((ctx, a: any) => commerce.engagement.run(ctx, a.storeId, { dryRun: a.dryRun, triggers: a.triggers })),
  );

  server.registerTool(
    'engagement_log',
    {
      description: 'Recent engagement send log (sent/suppressed/skipped with reasons) — the audit trail for the frequency caps and dedup.',
      inputSchema: { storeId: z.string(), limit: z.number().optional(), includeDryRun: z.boolean().optional() },
    },
    tool((ctx, a: any) => commerce.engagement.listLog(ctx, a.storeId, { limit: a.limit, includeDryRun: a.includeDryRun })),
  );

  // --- Shopability (AI-assistant commerce on/off) ---------------------------
  const AGENT_CHANNEL = z.enum(['CLAUDE', 'CHATGPT', 'GEMINI', 'PERPLEXITY', 'COPILOT', 'META_AI']);

  server.registerTool(
    'get_shopability',
    {
      description: 'Whether the store is shoppable by external AI assistants (Claude, ChatGPT, Gemini, Perplexity, Copilot, Meta AI), and which ones are enabled.',
      inputSchema: { storeId: z.string() },
    },
    tool((ctx, a: any) => commerce.shopability.get(ctx, a.storeId)),
  );

  server.registerTool(
    'set_shopability',
    {
      description: 'Enable/disable the store for AI-assistant shopping. Set the master switch (enabled), replace the set of allowed assistants (enabledChannels), and/or set a note shown to agents.',
      inputSchema: {
        storeId: z.string(),
        enabled: z.boolean().optional(),
        enabledChannels: z.array(AGENT_CHANNEL).optional(),
        agentNote: z.string().nullable().optional(),
      },
    },
    tool((ctx, a: any) => commerce.shopability.update(ctx, a.storeId, a)),
  );

  server.registerTool(
    'set_shopability_channel',
    {
      description: 'Turn a single AI assistant\'s shopping on or off for the store (e.g. disable ChatGPT but keep Claude).',
      inputSchema: { storeId: z.string(), channel: AGENT_CHANNEL, enabled: z.boolean() },
    },
    tool((ctx, a: any) => commerce.shopability.setChannel(ctx, a.storeId, a.channel, a.enabled)),
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
    'get_cart_recovery_policy',
    {
      description: 'Get the store\'s abandoned-cart recovery policy (when a cart is abandoned + the recovery message step delays).',
      inputSchema: { storeId: z.string() },
    },
    tool((ctx, a: any) => commerce.carts.getPolicy(ctx, a.storeId)),
  );

  server.registerTool(
    'set_cart_recovery_policy',
    {
      description: 'Tune abandoned-cart recovery: minutes of inactivity before a cart is abandoned, and the delay (minutes) before each recovery message step.',
      inputSchema: {
        storeId: z.string(),
        enabled: z.boolean().optional(),
        abandonAfterMinutes: z.number().int().positive().optional(),
        stepDelaysMinutes: z.array(z.number().int().nonnegative()).optional(),
      },
    },
    tool((ctx, a: any) => commerce.carts.setPolicy(ctx, a)),
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

  server.registerTool(
    'get_agent_sales',
    {
      description: 'AI-assistant sales attribution: paid orders and revenue driven by each shopping assistant (Claude, ChatGPT, …) over a date range, and their share of total revenue.',
      inputSchema: rangeSchema,
    },
    tool((ctx, a: any) => commerce.analytics.agentSales(ctx, a)),
  );

  server.registerTool(
    'get_analytics_revenue',
    {
      description: 'Revenue and order counts bucketed over time (day/week/month) for a date range.',
      inputSchema: { ...rangeSchema, interval: z.enum(['day', 'week', 'month']).optional() },
    },
    tool((ctx, a: any) => commerce.analytics.revenueSeries(ctx, a)),
  );

  server.registerTool(
    'get_analytics_funnel',
    {
      description: 'The cart → checkout → paid funnel with conversion rates over a date range.',
      inputSchema: rangeSchema,
    },
    tool((ctx, a: any) => commerce.analytics.funnel(ctx, a)),
  );

  // --- Invoices & accounting (GST) ------------------------------------------
  server.registerTool(
    'list_invoices',
    {
      description: 'List GST tax invoices (one per paid order), optionally filtered by store and date range. Each carries seller GSTIN, buyer details, place of supply, and split CGST/SGST or IGST.',
      inputSchema: { storeId: z.string().optional(), from: z.string().optional(), to: z.string().optional(), limit: z.number().int().positive().optional() },
    },
    tool((ctx, a: any) => commerce.invoices.list(ctx, a)),
  );

  server.registerTool(
    'get_invoice',
    {
      description: 'Fetch one tax invoice with its line items (HSN, taxable value, CGST/SGST/IGST). Pass orderId to fetch the invoice for an order, or id for the invoice directly.',
      inputSchema: { id: z.string().optional(), orderId: z.string().optional() },
    },
    tool((ctx, a: any) => (a.orderId ? commerce.invoices.getByOrder(ctx, a.orderId) : commerce.invoices.get(ctx, a.id))),
  );

  server.registerTool(
    'list_credit_notes',
    {
      description: 'List GST credit notes (raised when a paid order is refunded), optionally filtered by store.',
      inputSchema: { storeId: z.string().optional() },
    },
    tool((ctx, a: any) => commerce.invoices.creditNotes(ctx, a)),
  );

  server.registerTool(
    'sales_register',
    {
      description: 'GST sales register: every invoice + credit note in a period with taxable value and CGST/SGST/IGST, plus period totals. Set csv=true for a Tally/Zoho-Books-shaped CSV export.',
      inputSchema: { storeId: z.string().optional(), from: z.string().optional(), to: z.string().optional(), csv: z.boolean().optional() },
    },
    tool((ctx, a: any) => (a.csv ? commerce.accounting.salesRegisterCsv(ctx, a) : commerce.accounting.salesRegister(ctx, a))),
  );

  server.registerTool(
    'profit_and_loss',
    {
      description: 'P&L-lite over a period: net revenue (invoices − credit notes), GST collected, COGS (unit cost × qty), gross profit and margin.',
      inputSchema: { storeId: z.string().optional(), from: z.string().optional(), to: z.string().optional() },
    },
    tool((ctx, a: any) => commerce.accounting.profitAndLoss(ctx, a)),
  );

  // --- Store migration / bootstrap (Shopify, WooCommerce, Dukaan) -----------
  server.registerTool(
    'import_store',
    {
      description:
        'Bootstrap/migrate a store from a pasted export: import products, customers, historical orders, or an inventory sheet from Shopify, WooCommerce, or Dukaan. Paste the export contents as `data` (CSV, or JSON in the platform\'s own shape). Idempotent — products (by title/SKU), customers (by email), and orders (by source reference) already present are skipped. Use dryRun to preview, and updateExisting to refresh price/stock on products already present (matched by SKU).',
      inputSchema: {
        storeId: z.string(),
        source: z.enum(['SHOPIFY', 'WOOCOMMERCE', 'DUKAAN', 'GENERIC']),
        kind: z.enum(['products', 'customers', 'orders', 'inventory']).optional().describe('What the export contains (default products). "inventory" = a SKU+quantity stock sheet.'),
        data: z.string().describe('Raw export contents: CSV text or JSON'),
        dryRun: z.boolean().optional().describe('Preview only — parse + report without creating anything'),
        updateExisting: z.boolean().optional().describe('For products: update existing items (by SKU) instead of skipping'),
      },
    },
    tool((ctx, a: any) => commerce.imports.run(ctx, a)),
  );

  server.registerTool(
    'import_store_api',
    {
      description:
        'Bootstrap/migrate by pulling LIVE from the source store\'s API instead of a pasted export. Shopify needs credentials { shop, accessToken }; WooCommerce needs { url, consumerKey, consumerSecret }. Same idempotency + dryRun as import_store.',
      inputSchema: {
        storeId: z.string(),
        source: z.enum(['SHOPIFY', 'WOOCOMMERCE']),
        kind: z.enum(['products', 'customers', 'orders']).optional(),
        credentials: z.record(z.any()).describe('Shopify: { shop, accessToken } · WooCommerce: { url, consumerKey, consumerSecret }'),
        dryRun: z.boolean().optional(),
        updateExisting: z.boolean().optional(),
      },
    },
    tool((ctx, a: any) => commerce.imports.runFromApi(ctx, a)),
  );

  server.registerTool(
    'list_imports',
    { description: 'List past store-import runs (source, status, created/skipped/failed counts).', inputSchema: { storeId: z.string().optional() } },
    tool((ctx, a: any) => commerce.imports.list(ctx, a.storeId)),
  );

  server.registerTool(
    'get_import',
    { description: 'Fetch one import run with its per-row report.', inputSchema: { id: z.string() } },
    tool((ctx, a: any) => commerce.imports.get(ctx, a.id)),
  );

  // --- Legal policies (terms, privacy, shipping, refund, cookies) -----------
  const LEGAL_TYPE = z.enum(['TERMS', 'PRIVACY', 'SHIPPING', 'REFUND', 'COOKIES']);

  server.registerTool(
    'list_legal_policies',
    { description: 'List a store\'s legal policies (Terms, Privacy, Shipping, Refund, Cookies) with status + version.', inputSchema: { storeId: z.string() } },
    tool((ctx, a: any) => commerce.legal.list(ctx, a.storeId)),
  );

  server.registerTool(
    'get_legal_policy',
    { description: 'Fetch one legal policy by type.', inputSchema: { storeId: z.string(), type: LEGAL_TYPE } },
    tool((ctx, a: any) => commerce.legal.get(ctx, a.storeId, a.type)),
  );

  server.registerTool(
    'generate_legal_policies',
    {
      description:
        'Generate India/GST-aware legal policies from the store\'s seller identity + return policy. Omit `type` to generate all five (Terms, Privacy, Shipping, Refund, Cookies). Set publish:true to publish them on the storefront immediately. Set the seller tax identity + return policy first so the documents are accurate.',
      inputSchema: { storeId: z.string(), type: LEGAL_TYPE.optional(), publish: z.boolean().optional() },
    },
    tool((ctx, a: any) =>
      a.type ? commerce.legal.generate(ctx, a.storeId, a.type, { publish: a.publish }) : commerce.legal.generateAll(ctx, a.storeId, { publish: a.publish }),
    ),
  );

  server.registerTool(
    'set_legal_policy',
    {
      description: 'Create or edit a legal policy with your own title/body, and optionally publish it. Editing the body bumps its version.',
      inputSchema: {
        storeId: z.string(),
        type: LEGAL_TYPE,
        title: z.string().optional(),
        body: z.string().optional(),
        status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
      },
    },
    tool((ctx, a: any) => commerce.legal.set(ctx, a)),
  );

  server.registerTool(
    'publish_legal_policy',
    {
      description: 'Publish or unpublish a legal policy (controls whether it shows in the storefront footer).',
      inputSchema: { storeId: z.string(), type: LEGAL_TYPE, status: z.enum(['DRAFT', 'PUBLISHED']) },
    },
    tool((ctx, a: any) => commerce.legal.setStatus(ctx, a.storeId, a.type, a.status)),
  );

  server.registerTool(
    'list_legal_acceptances',
    {
      description: 'Buyer legal-policy acceptances captured at checkout (the consent trail): which policy versions each buyer agreed to, with order + email.',
      inputSchema: { storeId: z.string(), limit: z.number().int().positive().optional() },
    },
    tool((ctx, a: any) => commerce.legal.listAcceptances(ctx, a.storeId, a.limit)),
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

  server.registerTool(
    'get_stock_policy',
    {
      description: 'Get the store\'s stock-health policy (days-of-cover thresholds, reorder point, velocity window).',
      inputSchema: { storeId: z.string() },
    },
    tool((ctx, a: any) => commerce.stock.getPolicy(ctx, a.storeId)),
  );

  server.registerTool(
    'set_stock_policy',
    {
      description: 'Tune the stock policy: green/amber days-of-cover thresholds, reorder point, sales-velocity window, and inventory consumption — trackInventory (consume + enforce stock on sale) and allowBackorder (let orders exceed stock instead of blocking).',
      inputSchema: {
        storeId: z.string(),
        trackInventory: z.boolean().optional(),
        allowBackorder: z.boolean().optional(),
        enabled: z.boolean().optional(),
        greenDays: z.number().int().positive().optional(),
        amberDays: z.number().int().positive().optional(),
        reorderPoint: z.number().int().nonnegative().optional(),
        velocityWindowDays: z.number().int().positive().optional(),
      },
    },
    tool((ctx, a: any) => commerce.stock.setPolicy(ctx, a)),
  );

  server.registerTool(
    'get_checkout_settings',
    {
      description: 'Tax & shipping settings applied at checkout (tax rate, whether prices include tax, flat shipping, free-shipping threshold, address requirement).',
      inputSchema: { storeId: z.string() },
    },
    tool((ctx, a: any) => commerce.checkoutSettings.get(ctx, a.storeId)),
  );

  server.registerTool(
    'set_checkout_settings',
    {
      description: 'Configure checkout tax & shipping: taxBps (basis points, 1800=18% GST), taxLabel, pricesIncludeTax, flatShippingMinor, freeShippingOverMinor (subtotal at/above which shipping is free), and requireAddress (block checkout without a delivery address).',
      inputSchema: {
        storeId: z.string(),
        taxBps: z.number().int().min(0).max(10000).optional(),
        taxLabel: z.string().optional(),
        pricesIncludeTax: z.boolean().optional(),
        flatShippingMinor: z.number().int().nonnegative().optional(),
        freeShippingOverMinor: z.number().int().nonnegative().nullable().optional(),
        requireAddress: z.boolean().optional(),
      },
    },
    tool((ctx, a: any) => commerce.checkoutSettings.set(ctx, a)),
  );

  server.registerTool(
    'receive_stock',
    {
      description: 'Receive a restock / purchase order: add units to a variant\'s on-hand inventory. Records a RECEIVE movement in the ledger.',
      inputSchema: { variantId: z.string(), quantity: z.number().int().positive(), note: z.string().optional() },
    },
    tool((ctx, a: any) => commerce.stock.receive(ctx, a)),
  );

  server.registerTool(
    'adjust_stock',
    {
      description: 'Manually correct a variant\'s inventory by a signed delta (e.g. -2 for damage/shrinkage). Records an ADJUST movement.',
      inputSchema: { variantId: z.string(), delta: z.number().int(), note: z.string().optional() },
    },
    tool((ctx, a: any) => commerce.stock.adjust(ctx, a)),
  );

  server.registerTool(
    'set_inventory',
    {
      description: 'Set a variant\'s absolute on-hand count (a stocktake / recount). Records the implied ADJUST movement.',
      inputSchema: { variantId: z.string(), quantity: z.number().int().nonnegative(), note: z.string().optional() },
    },
    tool((ctx, a: any) => commerce.stock.setInventory(ctx, a)),
  );

  server.registerTool(
    'stock_ledger',
    {
      description: 'Inventory movement ledger for a store (optionally one variant): every change with reason (SALE/RETURN/CANCEL/RECEIVE/ADJUST), applied delta, resulting balance, and actor.',
      inputSchema: { storeId: z.string(), variantId: z.string().optional(), limit: z.number().int().positive().optional() },
    },
    tool((ctx, a: any) => commerce.stock.ledger(ctx, a)),
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
    'get_return_policy',
    {
      description: 'The store\'s return & cancellation policy: return window, eligible reasons, restocking fee, auto-approval, and the buyer self-cancel window.',
      inputSchema: { storeId: z.string() },
    },
    tool((ctx, a: any) => commerce.returns.getPolicy(ctx, a.storeId)),
  );

  server.registerTool(
    'set_return_policy',
    {
      description: 'Configure the return & cancellation policy the system enforces: return window (days), eligible reasons, restocking fee %, auto-approve, and the buyer self-cancel window (hours) / whether cancellation is allowed after shipment.',
      inputSchema: {
        storeId: z.string(),
        enabled: z.boolean().optional(),
        returnWindowDays: z.number().int().nonnegative().optional(),
        eligibleReasons: z.array(z.enum(['DAMAGED', 'WRONG_ITEM', 'NOT_AS_DESCRIBED', 'NO_LONGER_NEEDED', 'OTHER'])).optional(),
        restockingFeePercent: z.number().int().min(0).max(100).optional(),
        autoApprove: z.boolean().optional(),
        cancelEnabled: z.boolean().optional(),
        cancelWindowHours: z.number().int().nonnegative().optional(),
        allowCancelAfterShipment: z.boolean().optional(),
      },
    },
    tool((ctx, a: any) => commerce.returns.setPolicy(ctx, a)),
  );

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

  server.registerTool(
    'list_images',
    {
      description: 'List a store\'s image assets (optionally for one product), with optimization state and alt text.',
      inputSchema: { storeId: z.string(), productId: z.string().optional() },
    },
    tool((ctx, a: any) => commerce.images.list(ctx, { storeId: a.storeId, productId: a.productId })),
  );

  server.registerTool(
    'get_image_savings',
    {
      description: 'Total bytes/percent saved by image optimization for a store (page-speed & SEO win).',
      inputSchema: { storeId: z.string() },
    },
    tool((ctx, a: any) => commerce.images.savings(ctx, a.storeId)),
  );

  server.registerTool(
    'set_image_alt',
    {
      description: 'Set alt text for an image (accessibility + image SEO), or auto-generate it when generate=true.',
      inputSchema: { imageId: z.string(), alt: z.string().optional(), generate: z.boolean().optional() },
    },
    tool((ctx, a: any) => (a.generate ? commerce.images.generateAlt(ctx, a.imageId) : commerce.images.setAlt(ctx, a.imageId, a.alt ?? ''))),
  );

  // --- Partner access (client governs how much a partner may do) ------------
  server.registerTool(
    'get_partner_access',
    {
      description: 'Which partner (if any) manages this store and at what access level (MANAGE / VIEW / NONE).',
      inputSchema: {},
    },
    tool((ctx) => commerce.partners.getAccessForTenant(ctx.tenantId)),
  );

  server.registerTool(
    'set_partner_access',
    {
      description: 'Set how much the managing partner may do: MANAGE (full), VIEW (read-only), or NONE (revoke). Only the merchant may change this — a partner cannot change its own access.',
      inputSchema: { accessLevel: z.enum(['MANAGE', 'VIEW', 'NONE']) },
    },
    tool((ctx, a: any) => {
      if (ctx.actor?.kind === 'partner') throw new Error('A partner cannot change its own access level.');
      return commerce.partners.setAccessForTenant(ctx.tenantId, a.accessLevel);
    }),
  );

  // --- App marketplace ------------------------------------------------------
  server.registerTool(
    'list_app_catalog',
    { description: 'Browse the app marketplace: published apps a merchant can install (name, developer, category, requested scopes).', inputSchema: {} },
    tool(() => commerce.apps.catalog()),
  );

  server.registerTool(
    'list_installed_apps',
    { description: 'List the apps installed on this account, with their granted scopes and enabled state.', inputSchema: {} },
    tool((ctx) => commerce.apps.listInstalled(ctx)),
  );

  server.registerTool(
    'install_app',
    {
      description: 'Install a marketplace app by id or slug, granting the scopes it requests.',
      inputSchema: { appId: z.string(), config: z.record(z.any()).optional() },
    },
    tool((ctx, a: any) => commerce.apps.install(ctx, a.appId, a.config)),
  );

  server.registerTool(
    'uninstall_app',
    { description: 'Uninstall an app from this account.', inputSchema: { appId: z.string() } },
    tool((ctx, a: any) => commerce.apps.uninstall(ctx, a.appId)),
  );

  server.registerTool(
    'set_app_enabled',
    { description: 'Enable or disable an installed app without uninstalling it.', inputSchema: { appId: z.string(), enabled: z.boolean() } },
    tool((ctx, a: any) => commerce.apps.setEnabled(ctx, a.appId, a.enabled)),
  );

  // --- Audit trail ----------------------------------------------------------
  server.registerTool(
    'list_audit_log',
    {
      description: 'Merchant audit trail: who changed what in this account (owner/staff/API key, or a partner under delegated access). Filter by action, actorKind, or resource.',
      inputSchema: {
        limit: z.number().int().positive().optional(),
        action: z.string().optional(),
        actorKind: z.enum(['user', 'apiKey', 'partner']).optional(),
        resource: z.string().optional(),
      },
    },
    tool((ctx, a: any) => commerce.audit.list(ctx, a)),
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
      description: 'Set up the storefront sales & support chatbot: enable it, set name/greeting/persona, and configure human handoff — whether a person is available, the support email/phone, and how many unresolved replies trigger handoff (the bot connects the customer to your team, or tells them support will reach out).',
      inputSchema: {
        storeId: z.string(),
        enabled: z.boolean().optional(),
        displayName: z.string().optional(),
        greeting: z.string().optional(),
        persona: z.string().optional().describe('Tone, policies, what to emphasize'),
        humanHandoffEnabled: z.boolean().optional().describe('Whether a human is available to take over escalated chats'),
        supportEmail: z.string().optional(),
        supportPhone: z.string().optional(),
        maxRebuttals: z.number().int().min(1).max(5).optional().describe('Unresolved/pushback replies before auto-handoff (default 2)'),
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
