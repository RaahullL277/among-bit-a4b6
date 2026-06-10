import type { PrismaClient } from '@prisma/client';
import { AuthError, NotFoundError, ValidationError, type TenantContext } from '../context.js';
import { generateNumericOtp, generateToken, hashToken } from '../crypto.js';
import type { NotificationService } from './notification.service.js';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_RESEND_COOLDOWN_MS = 30 * 1000; // min gap between code re-sends
const OTP_MAX_ATTEMPTS = 5;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — buyer sessions are long-lived
const isProd = process.env.NODE_ENV === 'production';

/** A resolved buyer session: the customer identity behind a session token. */
export interface CustomerSessionContext {
  tenantId: string;
  storeId: string;
  customerId: string;
  email: string;
  name: string | null;
}

export interface AddressInput {
  name?: string;
  phone?: string;
  line1: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  isDefault?: boolean;
}

/**
 * Passwordless buyer accounts for the storefront: email-OTP login, a long-lived
 * session token, order history, and saved delivery addresses. Store-scoped and
 * keyed by the (opaque) store id — no merchant API key. A buyer's identity is a
 * `Customer` row (created on first login) for that store.
 */
export class CustomerAuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notifications?: NotificationService,
  ) {}

  private normalizeEmail(email: string): string {
    const e = email?.trim().toLowerCase();
    if (!e || !e.includes('@')) throw new ValidationError('A valid email is required.');
    return e;
  }

  private async storeCtx(storeId: string): Promise<{ ctx: TenantContext; store: { id: string; tenantId: string; name: string } }> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: { tenant: { select: { status: true } } },
    });
    if (!store || store.status !== 'ACTIVE' || store.tenant.status === 'SUSPENDED') {
      throw new NotFoundError('Store', storeId);
    }
    return { ctx: { tenantId: store.tenantId }, store: { id: store.id, tenantId: store.tenantId, name: store.name } };
  }

  // --- Login (email OTP) ----------------------------------------------------

  /** Email a one-time login code. Dev returns the code so flows are testable. */
  async requestOtp(storeId: string, email: string): Promise<{ sent: true; devCode?: string }> {
    const { ctx, store } = await this.storeCtx(storeId);
    const normalized = this.normalizeEmail(email);
    const identifier = `${storeId}:${normalized}`;
    // Resend cooldown (production): don't re-send if an unconsumed code was issued
    // seconds ago — blunts email/OTP-bomb abuse. Skipped in dev so the devCode
    // flow stays testable; the idempotent "sent" response hides it either way.
    if (isProd) {
      const recent = await this.prisma.otpCode.findFirst({
        where: { identifier, channel: 'email', consumedAt: null, createdAt: { gt: new Date(Date.now() - OTP_RESEND_COOLDOWN_MS) } },
        select: { id: true },
      });
      if (recent) return { sent: true };
    }
    const code = generateNumericOtp(6);
    await this.prisma.otpCode.create({
      data: {
        identifier,
        channel: 'email',
        codeHash: hashToken(code),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });
    // Best-effort delivery via the store's configured email provider.
    await this.notifications
      ?.notify(ctx, { storeId: store.id, event: 'LOGIN_CODE', recipientType: 'CUSTOMER', data: { customerEmail: normalized, code } })
      .catch(() => undefined);
    return isProd ? { sent: true } : { sent: true, devCode: code };
  }

  /** Verify a login code, find-or-create the buyer, and issue a session token. */
  async verifyOtp(storeId: string, email: string, code: string, name?: string): Promise<{ token: string; customer: { id: string; email: string; name: string | null } }> {
    const { store } = await this.storeCtx(storeId);
    const normalized = this.normalizeEmail(email);
    const identifier = `${storeId}:${normalized}`;
    const otp = await this.prisma.otpCode.findFirst({
      where: { identifier, channel: 'email', consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.expiresAt < new Date()) throw new AuthError('This code has expired. Request a new one.');
    if (otp.attempts >= OTP_MAX_ATTEMPTS) throw new AuthError('Too many attempts. Request a new code.');
    if (otp.codeHash !== hashToken(String(code ?? '').trim())) {
      await this.prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new AuthError('Incorrect code.');
    }
    await this.prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

    let customer = await this.prisma.customer.findFirst({
      where: { storeId, email: { equals: normalized, mode: 'insensitive' } },
    });
    if (!customer) {
      customer = await this.prisma.customer.create({
        data: { tenantId: store.tenantId, storeId, email: normalized, name: name?.trim() || undefined },
      });
    } else if (name?.trim() && !customer.name) {
      customer = await this.prisma.customer.update({ where: { id: customer.id }, data: { name: name.trim() } });
    }

    const { raw, hash } = generateToken('csa');
    await this.prisma.customerSession.create({
      data: { tenantId: store.tenantId, storeId, customerId: customer.id, tokenHash: hash, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    });
    return { token: raw, customer: { id: customer.id, email: customer.email ?? normalized, name: customer.name } };
  }

  /** Resolve a session token to the buyer behind it (throws if invalid/expired). */
  async resolveSession(rawToken: string): Promise<CustomerSessionContext> {
    if (!rawToken) throw new AuthError('Not signed in.');
    const session = await this.prisma.customerSession.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { customer: { select: { id: true, email: true, name: true } } },
    });
    if (!session || session.expiresAt < new Date()) throw new AuthError('Your session has expired. Please sign in again.');
    void this.prisma.customerSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    return {
      tenantId: session.tenantId,
      storeId: session.storeId,
      customerId: session.customerId,
      email: session.customer.email ?? '',
      name: session.customer.name,
    };
  }

  async logout(rawToken: string): Promise<{ ok: true }> {
    if (rawToken) await this.prisma.customerSession.deleteMany({ where: { tokenHash: hashToken(rawToken) } });
    return { ok: true };
  }

  // --- Account (session-scoped) ---------------------------------------------

  /** The signed-in buyer's profile. */
  async me(rawToken: string) {
    const s = await this.resolveSession(rawToken);
    return { id: s.customerId, email: s.email, name: s.name };
  }

  /** The signed-in buyer's order history (most recent first). */
  async myOrders(rawToken: string) {
    const s = await this.resolveSession(rawToken);
    const orders = await this.prisma.order.findMany({
      where: { storeId: s.storeId, customerId: s.customerId },
      orderBy: { createdAt: 'desc' },
      include: { items: true, shipment: { select: { status: true, trackingUrl: true } } },
      take: 50,
    });
    return orders.map((o) => ({
      number: o.number,
      status: o.status,
      placedAt: o.createdAt,
      currency: o.currency,
      totalMinor: o.totalMinor,
      itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
      items: o.items.map((i) => ({ title: i.title, quantity: i.quantity, unitPriceMinor: i.unitPriceMinor })),
      shipment: o.shipment ? { status: o.shipment.status, trackingUrl: o.shipment.trackingUrl } : null,
    }));
  }

  // --- Saved addresses ------------------------------------------------------

  async listAddresses(rawToken: string) {
    const s = await this.resolveSession(rawToken);
    return this.prisma.customerAddress.findMany({
      where: { customerId: s.customerId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async addAddress(rawToken: string, input: AddressInput) {
    const s = await this.resolveSession(rawToken);
    if (!input?.line1?.trim()) throw new ValidationError('A street address (line1) is required.');
    const count = await this.prisma.customerAddress.count({ where: { customerId: s.customerId } });
    const isDefault = input.isDefault || count === 0; // first saved address is the default
    if (isDefault) await this.prisma.customerAddress.updateMany({ where: { customerId: s.customerId }, data: { isDefault: false } });
    return this.prisma.customerAddress.create({
      data: {
        tenantId: s.tenantId,
        storeId: s.storeId,
        customerId: s.customerId,
        name: input.name?.trim() || undefined,
        phone: input.phone?.trim() || undefined,
        line1: input.line1.trim(),
        line2: input.line2?.trim() || undefined,
        city: input.city?.trim() || undefined,
        state: input.state?.trim() || undefined,
        pincode: input.pincode?.trim() || undefined,
        country: input.country?.trim() || 'IN',
        isDefault,
      },
    });
  }

  private async ownAddress(customerId: string, addressId: string) {
    const addr = await this.prisma.customerAddress.findUnique({ where: { id: addressId } });
    if (!addr || addr.customerId !== customerId) throw new NotFoundError('Address', addressId);
    return addr;
  }

  async updateAddress(rawToken: string, addressId: string, input: AddressInput) {
    const s = await this.resolveSession(rawToken);
    await this.ownAddress(s.customerId, addressId);
    if (input.isDefault) await this.prisma.customerAddress.updateMany({ where: { customerId: s.customerId }, data: { isDefault: false } });
    return this.prisma.customerAddress.update({
      where: { id: addressId },
      data: {
        name: input.name?.trim() ?? undefined,
        phone: input.phone?.trim() ?? undefined,
        line1: input.line1?.trim() ?? undefined,
        line2: input.line2?.trim() ?? undefined,
        city: input.city?.trim() ?? undefined,
        state: input.state?.trim() ?? undefined,
        pincode: input.pincode?.trim() ?? undefined,
        country: input.country?.trim() ?? undefined,
        isDefault: input.isDefault ?? undefined,
      },
    });
  }

  async removeAddress(rawToken: string, addressId: string) {
    const s = await this.resolveSession(rawToken);
    await this.ownAddress(s.customerId, addressId);
    await this.prisma.customerAddress.delete({ where: { id: addressId } });
    return { removed: true };
  }
}
