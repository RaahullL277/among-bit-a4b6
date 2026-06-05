import type { PrismaClient } from '@prisma/client';
import { getPrisma } from './prisma.js';
import { ApiKeyService } from './services/api-key.service.js';
import { StoreService } from './services/store.service.js';
import { ProductService } from './services/product.service.js';
import { CustomerService } from './services/customer.service.js';
import { OrderService } from './services/order.service.js';
import { IntegrationService } from './services/integration.service.js';
import { PaymentService } from './services/payment.service.js';
import { MessagingService } from './services/messaging.service.js';

/**
 * The single service layer shared by every transport. The REST API and the MCP
 * server both build a Commerce instance and call the same methods — this is
 * what keeps the platform "agentic-first": humans and agents use one surface.
 */
export class Commerce {
  readonly prisma: PrismaClient;
  readonly apiKeys: ApiKeyService;
  readonly stores: StoreService;
  readonly products: ProductService;
  readonly customers: CustomerService;
  readonly orders: OrderService;
  readonly integrations: IntegrationService;
  readonly payments: PaymentService;
  readonly messaging: MessagingService;

  constructor(prisma: PrismaClient = getPrisma()) {
    this.prisma = prisma;
    this.apiKeys = new ApiKeyService(prisma);
    this.stores = new StoreService(prisma);
    this.products = new ProductService(prisma);
    this.customers = new CustomerService(prisma);
    this.orders = new OrderService(prisma);
    this.integrations = new IntegrationService(prisma);
    this.payments = new PaymentService(prisma, this.integrations);
    this.messaging = new MessagingService(prisma, this.integrations);
  }
}

let singleton: Commerce | undefined;

/** Shared Commerce instance backed by the shared PrismaClient. */
export function getCommerce(): Commerce {
  if (!singleton) singleton = new Commerce();
  return singleton;
}
