import type { PlanTier } from '@prisma/client';

/** Defaults applied when a tenant has no explicit TenantPlan row. */
export interface PlanDefaults {
  storeLimit: number | null; // null = unlimited
  features: string[];
}

export const TIER_DEFAULTS: Record<PlanTier, PlanDefaults> = {
  FREE: { storeLimit: 1, features: [] },
  GROWTH: { storeLimit: 5, features: ['analytics', 'cart_recovery'] },
  ENTERPRISE: { storeLimit: null, features: ['analytics', 'cart_recovery', 'priority_support'] },
};

export interface EffectivePlan {
  tier: PlanTier;
  storeLimit: number | null;
  features: string[];
  isDefault: boolean;
}

/** Resolve a stored plan row (or null) into the effective plan for a tenant. */
export function effectivePlan(row: { tier: PlanTier; storeLimit: number | null; features: string[] } | null): EffectivePlan {
  if (!row) return { tier: 'FREE', ...TIER_DEFAULTS.FREE, isDefault: true };
  const defaults = TIER_DEFAULTS[row.tier];
  return {
    tier: row.tier,
    // An explicit storeLimit overrides the tier default; otherwise use the tier default.
    storeLimit: row.storeLimit ?? defaults.storeLimit,
    features: row.features.length ? row.features : defaults.features,
    isDefault: false,
  };
}
