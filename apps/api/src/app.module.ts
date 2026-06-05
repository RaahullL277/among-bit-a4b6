import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeyGuard } from './auth/api-key.guard.js';
import { HealthController } from './controllers/health.controller.js';
import { StoresController } from './controllers/stores.controller.js';
import { ProductsController } from './controllers/products.controller.js';
import { CustomersController } from './controllers/customers.controller.js';
import { OrdersController } from './controllers/orders.controller.js';
import { PaymentsController } from './controllers/payments.controller.js';
import { IntegrationsController } from './controllers/integrations.controller.js';
import { MessagingController } from './controllers/messaging.controller.js';
import { NotificationsController } from './controllers/notifications.controller.js';
import { ApiKeysController } from './controllers/api-keys.controller.js';
import { WebhooksController } from './controllers/webhooks.controller.js';

@Module({
  controllers: [
    HealthController,
    StoresController,
    ProductsController,
    CustomersController,
    OrdersController,
    PaymentsController,
    IntegrationsController,
    MessagingController,
    NotificationsController,
    ApiKeysController,
    WebhooksController,
  ],
  providers: [
    // API-key auth applies to every route except those marked @Public().
    { provide: APP_GUARD, useClass: ApiKeyGuard },
  ],
})
export class AppModule {}
