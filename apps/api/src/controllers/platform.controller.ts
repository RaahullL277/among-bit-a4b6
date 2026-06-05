import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { getCommerce, type PlatformContext, type PlatformRole } from '@acp/core';
import { Public } from '../common/public.decorator.js';
import { PlatformAuthGuard } from '../auth/platform-auth.guard.js';
import { Platform, PlatformPermissions } from '../common/platform.decorator.js';

/** Operator back-office: tenant/store directory, suspension, staff, audit. */
@Controller('platform')
@Public()
@UseGuards(PlatformAuthGuard)
export class PlatformController {
  private readonly commerce = getCommerce();

  // --- Tenant / store directory ---------------------------------------------
  @Get('tenants')
  @PlatformPermissions('platform:tenants:read')
  listTenants(@Query('search') search?: string, @Query('status') status?: 'ACTIVE' | 'SUSPENDED') {
    return this.commerce.platform.listTenants({ search, status });
  }

  @Get('tenants/:id')
  @PlatformPermissions('platform:tenants:read')
  getTenant(@Param('id') id: string) {
    return this.commerce.platform.getTenant(id);
  }

  @Post('tenants/:id/suspend')
  @PlatformPermissions('platform:tenants:write')
  suspendTenant(@Platform() p: PlatformContext, @Param('id') id: string) {
    return this.commerce.platform.setTenantStatus(p, id, 'SUSPENDED');
  }

  @Post('tenants/:id/reactivate')
  @PlatformPermissions('platform:tenants:write')
  reactivateTenant(@Platform() p: PlatformContext, @Param('id') id: string) {
    return this.commerce.platform.setTenantStatus(p, id, 'ACTIVE');
  }

  @Post('stores/:id/suspend')
  @PlatformPermissions('platform:tenants:write')
  suspendStore(@Platform() p: PlatformContext, @Param('id') id: string) {
    return this.commerce.platform.setStoreStatus(p, id, 'SUSPENDED');
  }

  @Post('stores/:id/reactivate')
  @PlatformPermissions('platform:tenants:write')
  reactivateStore(@Platform() p: PlatformContext, @Param('id') id: string) {
    return this.commerce.platform.setStoreStatus(p, id, 'ACTIVE');
  }

  // --- Platform staff -------------------------------------------------------
  @Get('staff')
  @PlatformPermissions('platform:staff:manage')
  listStaff() {
    return this.commerce.platformAuth.listStaff();
  }

  @Post('staff')
  @PlatformPermissions('platform:staff:manage')
  createStaff(@Body() body: { email: string; name?: string; role: PlatformRole }) {
    return this.commerce.platformAuth.createStaff(body);
  }

  @Patch('staff/:id')
  @PlatformPermissions('platform:staff:manage')
  changeRole(@Param('id') id: string, @Body() body: { role: PlatformRole }) {
    return this.commerce.platformAuth.changeStaffRole(id, body.role);
  }

  @Delete('staff/:id')
  @PlatformPermissions('platform:staff:manage')
  removeStaff(@Param('id') id: string) {
    return this.commerce.platformAuth.removeStaff(id);
  }

  // --- Audit ----------------------------------------------------------------
  @Get('audit')
  @PlatformPermissions('platform:audit:read')
  audit(@Query('limit') limit?: string) {
    return this.commerce.platform.listAudit({ limit: limit ? Number(limit) : undefined });
  }
}
