// Public surface of @acp/core — the shared domain service layer.

export { Commerce, getCommerce } from './commerce.js';
export { getPrisma, type PrismaClient } from './prisma.js';
export {
  type TenantContext,
  NotFoundError,
  ValidationError,
  AuthError,
  ForbiddenError,
} from './context.js';

export { generateApiKey, hashApiKey } from './crypto.js';

// Services (types for callers that want explicit references)
export { ApiKeyService, type CreatedApiKey } from './services/api-key.service.js';
export { StoreService, type CreateStoreInput, type UpdateStoreInput } from './services/store.service.js';
export {
  ProductService,
  type CreateProductInput,
  type UpdateProductInput,
  type VariantInput,
} from './services/product.service.js';
export { CustomerService, type CreateCustomerInput } from './services/customer.service.js';
export { OrderService } from './services/order.service.js';
export { IntegrationService } from './services/integration.service.js';
export { PaymentService, type CheckoutInput } from './services/payment.service.js';
export { MessagingService } from './services/messaging.service.js';
export {
  NotificationService,
  type NotifyInput,
  type DispatchResult,
} from './services/notification.service.js';
export { AuthService, type IssuedSession } from './services/auth.service.js';
export { MemberService } from './services/member.service.js';
export { CartService, type CreateCartInput } from './services/cart.service.js';
export { StockService, type VariantStock } from './services/stock.service.js';
export { StorefrontService } from './services/storefront.service.js';
export {
  AnalyticsService,
  type AnalyticsRange,
  type Interval,
} from './services/analytics.service.js';
export { ShippingService, type CreateShipmentInput } from './services/shipping.service.js';
export {
  type ShippingProvider,
  type Address,
  DelhiveryAdapter,
} from './adapters/shipping.js';
export { getShippingProvider } from './adapters/registry.js';
export {
  type StockScorer,
  type StockSignal,
  type StockScore,
  HeuristicStockScorer,
  defaultStockScorer,
} from './stock/scorer.js';
export {
  type Permission,
  type Actor,
  ROLE_PERMISSIONS,
  ALL_PERMISSIONS,
  permissionsForRole,
  actorHasPermission,
  requirePermission,
} from './authz.js';

// Adapters / providers
export {
  type PaymentProvider,
  type ProviderCredentials,
  RazorpayAdapter,
  GoKwikAdapter,
} from './adapters/payment.js';
export { type MessagingProvider, WhatsAppAdapter } from './adapters/messaging.js';
export { type EmailProvider, ResendAdapter } from './adapters/email.js';
export { type SmsProvider, Msg91Adapter } from './adapters/sms.js';
export {
  getPaymentProvider,
  getMessagingProvider,
  getEmailProvider,
  getSmsProvider,
  PROVIDER_KIND,
  CHANNEL_PROVIDER,
} from './adapters/registry.js';
export {
  DEFAULT_TEMPLATES,
  DEFAULT_PREFERENCES,
  renderTemplate,
} from './notifications/defaults.js';

// Prisma-generated enums/types re-exported for transport layers.
export type {
  Store,
  Product,
  Order,
  Customer,
  Payment,
  OrderStatus,
  ProviderName,
  IntegrationKind,
  NotificationChannel,
  NotificationEvent,
  RecipientType,
  Role,
  User,
  Cart,
  CartStatus,
  StockStatus,
  Shipment,
  ShipmentStatus,
} from '@prisma/client';
