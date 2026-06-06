import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard.js';
import { RateLimitMiddleware } from './common/rate-limit.middleware.js';
import { AuditInterceptor } from './common/audit.interceptor.js';
import { AuditController } from './controllers/audit.controller.js';
import { AppsController } from './controllers/apps.controller.js';
import { ListingController } from './controllers/listing.controller.js';
import { CheckoutSettingsController } from './controllers/checkout-settings.controller.js';
import { AuthController } from './controllers/auth.controller.js';
import { MembersController } from './controllers/members.controller.js';
import { HealthController } from './controllers/health.controller.js';
import { StoresController } from './controllers/stores.controller.js';
import { ProductsController } from './controllers/products.controller.js';
import { CustomersController } from './controllers/customers.controller.js';
import { OrdersController } from './controllers/orders.controller.js';
import { PaymentsController } from './controllers/payments.controller.js';
import { IntegrationsController } from './controllers/integrations.controller.js';
import { MessagingController } from './controllers/messaging.controller.js';
import { NotificationsController } from './controllers/notifications.controller.js';
import { CartsController } from './controllers/carts.controller.js';
import { StockController } from './controllers/stock.controller.js';
import { StorefrontController } from './controllers/storefront.controller.js';
import { AnalyticsController } from './controllers/analytics.controller.js';
import { SupportController } from './controllers/support.controller.js';
import { MarketingController } from './controllers/marketing.controller.js';
import { ReviewsController } from './controllers/reviews.controller.js';
import { OffersController } from './controllers/offers.controller.js';
import { PagesController } from './controllers/pages.controller.js';
import { TemplatesController } from './controllers/templates.controller.js';
import { CohortsController } from './controllers/cohorts.controller.js';
import { EngagementController } from './controllers/engagement.controller.js';
import { ShopabilityController } from './controllers/shopability.controller.js';
import { AgentController } from './controllers/agent.controller.js';
import { ReturnsController } from './controllers/returns.controller.js';
import { InvoicesController } from './controllers/invoices.controller.js';
import { AccountingController } from './controllers/accounting.controller.js';
import { LoyaltyController } from './controllers/loyalty.controller.js';
import { SubscriptionsController } from './controllers/subscriptions.controller.js';
import { SeoController } from './controllers/seo.controller.js';
import { PricingController } from './controllers/pricing.controller.js';
import { ShipmentsController } from './controllers/shipments.controller.js';
import { PlatformAuthController } from './controllers/platform-auth.controller.js';
import { PlatformController } from './controllers/platform.controller.js';
import { PartnerController } from './controllers/partner.controller.js';
import { PartnerAccessController } from './controllers/partner-access.controller.js';
import { ApiKeysController } from './controllers/api-keys.controller.js';
import { WebhooksController } from './controllers/webhooks.controller.js';

@Module({
  controllers: [
    HealthController,
    AuthController,
    MembersController,
    StoresController,
    ProductsController,
    CustomersController,
    OrdersController,
    PaymentsController,
    IntegrationsController,
    MessagingController,
    NotificationsController,
    CartsController,
    StockController,
    StorefrontController,
    AnalyticsController,
    SupportController,
    MarketingController,
    ReviewsController,
    OffersController,
    PagesController,
    TemplatesController,
    CohortsController,
    EngagementController,
    ShopabilityController,
    AgentController,
    AuditController,
    AppsController,
    ListingController,
    CheckoutSettingsController,
    ReturnsController,
    InvoicesController,
    AccountingController,
    LoyaltyController,
    SubscriptionsController,
    SeoController,
    PricingController,
    ShipmentsController,
    PlatformAuthController,
    PlatformController,
    PartnerController,
    PartnerAccessController,
    ApiKeysController,
    WebhooksController,
  ],
  providers: [
    // Auth + RBAC applies to every route except those marked @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
    // Records tenant-scoped mutations to the merchant audit trail.
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule implements NestModule {
  // IP-based rate limiting runs before guards, protecting public endpoints.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RateLimitMiddleware).forRoutes('*');
  }
}
