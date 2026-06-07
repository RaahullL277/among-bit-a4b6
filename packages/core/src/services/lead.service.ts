import type { PrismaClient, StoreBuildSource, StoreBuildStatus } from '@prisma/client';
import { ValidationError } from '../context.js';

export interface BuildAssetInput {
  name: string;
  type?: string;
  size?: number;
  /** Optional small inline preview (data URL); large blobs are dropped. */
  dataUrl?: string;
}

export interface SubmitLeadInput {
  source?: StoreBuildSource;
  email: string;
  prompt: string;
  businessName?: string;
  assets?: BuildAssetInput[];
  referrer?: string;
}

const MAX_ASSETS = 12;
const MAX_DATAURL_CHARS = 700_000; // ~512KB binary; keep only small previews inline
const MAX_PROMPT_CHARS = 4000;

/**
 * Captures "start building your store" leads from the marketing landing pages
 * (ecom.imagine.bo merchants, ecompartner.imagine.bo partners). A lead is the
 * prompt a prospect typed plus a manifest of the images/files they imported —
 * the seed an agent (or our team) uses to bootstrap their store. No tenant is
 * created here; this is top-of-funnel.
 */
export class LeadService {
  constructor(private readonly prisma: PrismaClient) {}

  private normalizeEmail(email: string): string {
    const e = email?.trim().toLowerCase();
    if (!e || !e.includes('@')) throw new ValidationError('A valid email is required.');
    return e;
  }

  /** Keep the asset manifest small + safe: cap count and drop oversized previews. */
  private sanitizeAssets(assets?: BuildAssetInput[]): BuildAssetInput[] {
    if (!Array.isArray(assets)) return [];
    return assets.slice(0, MAX_ASSETS).map((a) => ({
      name: String(a?.name ?? 'file').slice(0, 200),
      type: a?.type ? String(a.type).slice(0, 100) : undefined,
      size: typeof a?.size === 'number' && a.size >= 0 ? a.size : undefined,
      dataUrl: typeof a?.dataUrl === 'string' && a.dataUrl.length <= MAX_DATAURL_CHARS ? a.dataUrl : undefined,
    }));
  }

  async submit(input: SubmitLeadInput) {
    const email = this.normalizeEmail(input.email);
    const prompt = (input.prompt ?? '').trim();
    if (prompt.length < 3) throw new ValidationError('Tell us a little about your store to get started.');
    const source: StoreBuildSource = input.source === 'PARTNER' ? 'PARTNER' : 'MERCHANT';
    const assets = this.sanitizeAssets(input.assets);

    const lead = await this.prisma.storeBuildLead.create({
      data: {
        source,
        email,
        prompt: prompt.slice(0, MAX_PROMPT_CHARS),
        businessName: input.businessName?.trim() || undefined,
        assets: assets as unknown as object,
        referrer: input.referrer?.slice(0, 500) || undefined,
      },
    });

    return {
      id: lead.id,
      source: lead.source,
      status: lead.status,
      assetCount: assets.length,
      // Where the prospect continues — carrying the email + prompt into signup.
      next: {
        action: 'CONTINUE_SIGNUP',
        message: source === 'PARTNER'
          ? "We've got your details — your partner workspace is being prepared. Check your email to continue."
          : "We've got your store brief — let's finish setting up your account to start building.",
      },
    };
  }

  /** Ops view of captured leads (newest first), optionally filtered. */
  async list(opts: { source?: StoreBuildSource; status?: StoreBuildStatus; limit?: number } = {}) {
    return this.prisma.storeBuildLead.findMany({
      where: { source: opts.source, status: opts.status },
      orderBy: { createdAt: 'desc' },
      take: Math.min(opts.limit ?? 100, 500),
    });
  }
}
