// Public surface of @acp/core — the shared domain service layer.

export { Commerce, getCommerce } from './commerce.js';
export { getPrisma, type PrismaClient } from './prisma.js';
export {
  type TenantContext,
  NotFoundError,
  ValidationError,
  AuthError,
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

// Adapters / providers
export {
  type PaymentProvider,
  type ProviderCredentials,
  RazorpayAdapter,
  GoKwikAdapter,
} from './adapters/payment.js';
export { type MessagingProvider, WhatsAppAdapter } from './adapters/messaging.js';
export { getPaymentProvider, getMessagingProvider, PROVIDER_KIND } from './adapters/registry.js';

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
} from '@prisma/client';
