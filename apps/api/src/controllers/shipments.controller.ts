import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { getCommerce, type ShipmentStatus, type TenantContext } from '@acp/core';
import { Tenant } from '../common/tenant.decorator.js';
import { Permissions } from '../common/permissions.decorator.js';

@Controller('shipments')
export class ShipmentsController {
  private readonly commerce = getCommerce();

  /** Create a shipment for a paid/placed order via the active courier. */
  @Post()
  @Permissions('orders:write')
  create(@Tenant() t: TenantContext, @Body() body: any) {
    return this.commerce.shipping.createShipment(t, body);
  }

  @Get()
  @Permissions('orders:read')
  list(
    @Tenant() t: TenantContext,
    @Query('storeId') storeId?: string,
    @Query('status') status?: ShipmentStatus,
  ) {
    return this.commerce.shipping.listShipments(t, { storeId, status });
  }

  @Get(':id')
  @Permissions('orders:read')
  get(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.commerce.shipping.getShipment(t, id);
  }

  @Post(':id/cancel')
  @Permissions('orders:write')
  cancel(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.commerce.shipping.cancelShipment(t, id);
  }
}
