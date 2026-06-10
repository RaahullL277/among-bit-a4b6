import { Injectable, type NestMiddleware } from '@nestjs/common';

// Minimal structural types so we don't depend on @types/express here.
interface Req {
  baseUrl?: string;
  path?: string;
  url?: string;
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}
interface Res {
  setHeader(name: string, value: string | number): void;
  status(code: number): Res;
  json(body: unknown): void;
}
type Next = (err?: unknown) => void;

/**
 * Lightweight in-memory rate limiter (no external deps). Guards public and
 * abuse-prone endpoints with a fixed-window counter keyed by client IP + a
 * route class. Public reads get a generous budget; checkout / auth / tracking
 * get a tight one; authenticated API calls a high one. Returns 429 with a
 * Retry-After header when a bucket is exhausted.
 *
 * For a multi-instance deployment this would move to a shared store (Redis);
 * the classification and headers stay the same.
 */

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
const DISABLED = process.env.RATE_LIMIT_DISABLED === '1';

interface Rule {
  label: string;
  limit: number;
}

// Route classes, most specific first.
function classify(path: string): Rule | null {
  if (path === '/health' || path === '/') return null; // never limited
  if (/^\/(auth|platform-auth|partner-auth)\//.test(path)) return { label: 'auth', limit: num('RATE_LIMIT_AUTH', 20) };
  if (/^\/webhooks\//.test(path)) return { label: 'webhook', limit: num('RATE_LIMIT_WEBHOOK', 120) };
  if (/^\/agent\/[^/]+\/(checkout|carts)/.test(path)) return { label: 'agent_write', limit: num('RATE_LIMIT_AGENT_WRITE', 15) };
  // Buyer auth (OTP), support chat (LLM cost) and public lead capture are
  // abuse-prone → the tighter write budget, not the generous public-read one.
  if (/^\/leads\b/.test(path) || /^\/storefront\/[^/]+\/(checkout|carts|track|unsubscribe|marketing-consent|account|support)/.test(path))
    return { label: 'store_write', limit: num('RATE_LIMIT_STORE_WRITE', 30) };
  if (path.startsWith('/storefront') || path.startsWith('/agent')) return { label: 'public_read', limit: num('RATE_LIMIT_PUBLIC', 120) };
  return { label: 'api', limit: num('RATE_LIMIT_API', 300) }; // authenticated API
}

function num(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

interface Bucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  // Module-level shared store (one app instance).
  private static buckets = new Map<string, Bucket>();
  private static sweeper: NodeJS.Timeout | undefined;

  constructor() {
    if (!RateLimitMiddleware.sweeper && !DISABLED) {
      RateLimitMiddleware.sweeper = setInterval(() => {
        const now = Date.now();
        for (const [k, b] of RateLimitMiddleware.buckets) if (now >= b.resetAt) RateLimitMiddleware.buckets.delete(k);
      }, WINDOW_MS);
      RateLimitMiddleware.sweeper.unref?.();
    }
  }

  use(req: Req, res: Res, next: Next): void {
    if (DISABLED) return next();
    const rule = classify((req.baseUrl || '') + (req.path || req.url));
    if (!rule) return next();

    const ip = clientIp(req);
    const key = `${ip}|${rule.label}`;
    const now = Date.now();
    let b = RateLimitMiddleware.buckets.get(key);
    if (!b || now >= b.resetAt) {
      b = { count: 0, resetAt: now + WINDOW_MS };
      RateLimitMiddleware.buckets.set(key, b);
    }
    b.count++;

    const remaining = Math.max(0, rule.limit - b.count);
    res.setHeader('X-RateLimit-Limit', rule.limit);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(b.resetAt / 1000));

    if (b.count > rule.limit) {
      const retryAfter = Math.ceil((b.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      res.status(429).json({ error: 'Too many requests. Please retry later.', retryAfter });
      return;
    }
    next();
  }
}

function clientIp(req: Req): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  if (Array.isArray(fwd) && fwd.length) return fwd[0];
  return req.ip || req.socket?.remoteAddress || 'unknown';
}
