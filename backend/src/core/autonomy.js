/**
 * @module autonomy
 * @description Autonomy tier classification system for NudgeOps.
 *
 * Four tiers control how much human oversight is required:
 *   Tier 0 (FULL_AUTONOMY)               - Agent acts freely, no human involved.
 *   Tier 1 (AUTONOMOUS_WITH_NOTIFICATION) - Agent acts, human is notified afterward.
 *   Tier 2 (HUMAN_APPROVAL_REQUIRED)      - Agent proposes, human must approve.
 *   Tier 3 (FORBIDDEN)                    - Action is never allowed.
 */

const logger = require('../utils/logger');

/* ------------------------------------------------------------------ */
/*  Autonomy tier enum                                                */
/* ------------------------------------------------------------------ */

/** @enum {number} */
const AutonomyTier = Object.freeze({
  FULL_AUTONOMY: 0,
  AUTONOMOUS_WITH_NOTIFICATION: 1,
  HUMAN_APPROVAL_REQUIRED: 2,
  FORBIDDEN: 3,
});

/* ------------------------------------------------------------------ */
/*  Tier 0 – Full Autonomy                                           */
/* ------------------------------------------------------------------ */

/** @type {Object<string, { description: string, condition: string }>} */
const TIER_0_ACTIONS = Object.freeze({
  DND_SCRUB: {
    description: 'Filter out users on Do-Not-Disturb registry',
    condition: 'Always required before any send',
  },
  CONSENT_VERIFICATION: {
    description: 'Verify opt-in consent exists for user + channel',
    condition: 'Always required before any send',
  },
  FREQUENCY_CAP: {
    description: 'Enforce per-user message frequency limits',
    condition: 'Always enforced',
  },
  COHORT_ESTIMATION: {
    description: 'Estimate cohort size for campaign targeting',
    condition: 'Read-only estimation, no side effects',
  },
  COPY_VALIDATION: {
    description: 'Validate message copy against content policy',
    condition: 'Automated policy check',
  },
  TEMPLATE_VALIDATION: {
    description: 'Validate message template structure and variables',
    condition: 'Structural validation only',
  },
  DEEPLINK_VALIDATION: {
    description: 'Verify deeplinks resolve correctly',
    condition: 'Automated link verification',
  },
  CANNIBALIZATION_SCAN: {
    description: 'Detect overlapping campaigns targeting same users',
    condition: 'Read-only analysis',
  },
  AUTO_SUPPRESS_CONVERTED: {
    description: 'Auto-suppress users who already converted',
    condition: 'Suppress to avoid redundant nudges',
  },
  PAUSE_ON_DELIVERY_FAILURE: {
    description: 'Pause campaign when delivery failure rate exceeds 15%',
    condition: 'delivery_failure_rate > 0.15',
  },
  PAUSE_ON_UNSUBSCRIBE: {
    description: 'Pause campaign when unsubscribe rate exceeds 2%',
    condition: 'unsubscribe_rate > 0.02',
  },
  PAUSE_ON_SPAM: {
    description: 'Pause campaign when spam complaint rate exceeds 0.1%',
    condition: 'spam_rate > 0.001',
  },
  KILL_LOSING_VARIANT: {
    description: 'Kill losing A/B variant when statistical significance reached',
    condition: 'p_value < 0.01',
  },
  GRADUATE_WINNER: {
    description: 'Graduate winning variant to full audience',
    condition: 'p_value < 0.05 AND sample_size > 10000',
  },
  BLACKOUT_ENFORCEMENT: {
    description: 'Enforce blackout windows (festivals, incidents, etc.)',
    condition: 'Always enforced',
  },
  REQUEUE_THROTTLED: {
    description: 'Re-queue throttled messages for later delivery',
    condition: 'Automatic queue management',
  },
  REFRESH_RECO_VECTORS: {
    description: 'Refresh recommendation vectors for personalisation',
    condition: 'Periodic background refresh',
  },
  ARCHIVE_OLD_CAMPAIGNS: {
    description: 'Archive campaigns older than retention period',
    condition: 'campaign_age > retention_period',
  },
});

/* ------------------------------------------------------------------ */
/*  Tier 1 – Autonomous with Notification                            */
/* ------------------------------------------------------------------ */

/** @type {Object<string, { description: string, condition: string }>} */
const TIER_1_ACTIONS = Object.freeze({
  SHIFT_SEND_TIME: {
    description: 'Shift campaign send time by up to 2 hours',
    condition: 'time_shift <= 2h',
  },
  SWAP_CREATIVE_VARIANT: {
    description: 'Swap to better-performing creative variant',
    condition: 'ctr_delta > 0.40 (40%)',
  },
  EXPAND_LOOKALIKE: {
    description: 'Expand audience with lookalike segment',
    condition: 'expansion <= 20%',
  },
  REDUCE_FREQUENCY_FATIGUED: {
    description: 'Reduce message frequency for fatigued users',
    condition: 'User fatigue score in at-risk or critical range',
  },
  ADD_EXCLUSION_PURCHASED_24H: {
    description: 'Exclude users who purchased in last 24 hours',
    condition: 'purchase_recency <= 24h',
  },
  SWITCH_SMS_ROUTE: {
    description: 'Switch SMS delivery route for better deliverability',
    condition: 'Route performance degradation detected',
  },
  REGENERATE_SUBJECT_LINES: {
    description: 'Regenerate email subject lines using AI',
    condition: 'Low open rate detected',
  },
  ACTIVATE_FALLBACK_TEMPLATE: {
    description: 'Activate fallback template when primary fails validation',
    condition: 'Primary template validation failure',
  },
});

/* ------------------------------------------------------------------ */
/*  Tier 2 – Human Approval Required                                 */
/* ------------------------------------------------------------------ */

/** @type {Object<string, { description: string, condition: string }>} */
const TIER_2_ACTIONS = Object.freeze({
  LAUNCH_NEW_CAMPAIGN: {
    description: 'Launch a brand-new campaign',
    condition: 'Any new campaign launch',
  },
  SEND_TO_LARGE_AUDIENCE: {
    description: 'Send to more than 1 lakh (100,000) users',
    condition: 'audience_size > 100000',
  },
  DISCOUNT_ABOVE_15: {
    description: 'Offer discount greater than 15%',
    condition: 'discount_percentage > 15',
  },
  NEW_CHANNEL_SURFACE: {
    description: 'Use a channel/surface not previously used for this campaign',
    condition: 'Channel not in campaign history',
  },
  REACTIVATION_DORMANT_90D: {
    description: 'Target users dormant for more than 90 days',
    condition: 'user_dormancy > 90 days',
  },
  TARGET_UNDER_18: {
    description: 'Target users identified as under 18',
    condition: 'user_age < 18',
  },
  CROSS_CATEGORY: {
    description: 'Send cross-category recommendations',
    condition: 'Category differs from user primary interest',
  },
  BUDGET_ABOVE_5L: {
    description: 'Campaign budget exceeds 5 lakh',
    condition: 'budget > 500000',
  },
  OVERRIDE_FREQUENCY_CAP: {
    description: 'Override per-user frequency cap',
    condition: 'Manual override requested',
  },
  REGIONAL_LANGUAGE_NEW: {
    description: 'First-time use of a regional language for this campaign type',
    condition: 'Language not previously used',
  },
});

/* ------------------------------------------------------------------ */
/*  Tier 3 – Forbidden                                               */
/* ------------------------------------------------------------------ */

/** @type {Object<string, { description: string, condition: string }>} */
const TIER_3_ACTIONS = Object.freeze({
  SEND_WITHOUT_CONSENT: {
    description: 'Send message without user opt-in consent',
    condition: 'NEVER ALLOWED',
  },
  BYPASS_DND: {
    description: 'Bypass Do-Not-Disturb registry',
    condition: 'NEVER ALLOWED',
  },
  FAKE_SCARCITY_DARK_PATTERNS: {
    description: 'Use fake scarcity, urgency, or dark patterns',
    condition: 'NEVER ALLOWED',
  },
  EXPOSE_PII: {
    description: 'Expose personally identifiable information',
    condition: 'NEVER ALLOWED',
  },
  SMS_OUTSIDE_9_21_IST: {
    description: 'Send SMS outside 9 AM – 9 PM IST window',
    condition: 'NEVER ALLOWED',
  },
  RESTRICTED_CATEGORY_WITHOUT_TEMPLATE: {
    description: 'Send restricted category content without approved template',
    condition: 'NEVER ALLOWED',
  },
  FABRICATE_ANALYTICS: {
    description: 'Fabricate or falsify analytics data',
    condition: 'NEVER ALLOWED',
  },
  DELETE_AUDIT_LOGS: {
    description: 'Delete or tamper with audit log entries',
    condition: 'NEVER ALLOWED',
  },
  OVERRIDE_BLACKOUT: {
    description: 'Override blackout window enforcement',
    condition: 'NEVER ALLOWED',
  },
});

/* ------------------------------------------------------------------ */
/*  Build a fast lookup: action name → tier                          */
/* ------------------------------------------------------------------ */

const _actionTierMap = new Map();

for (const action of Object.keys(TIER_0_ACTIONS)) {
  _actionTierMap.set(action, { tier: AutonomyTier.FULL_AUTONOMY, meta: TIER_0_ACTIONS[action] });
}
for (const action of Object.keys(TIER_1_ACTIONS)) {
  _actionTierMap.set(action, { tier: AutonomyTier.AUTONOMOUS_WITH_NOTIFICATION, meta: TIER_1_ACTIONS[action] });
}
for (const action of Object.keys(TIER_2_ACTIONS)) {
  _actionTierMap.set(action, { tier: AutonomyTier.HUMAN_APPROVAL_REQUIRED, meta: TIER_2_ACTIONS[action] });
}
for (const action of Object.keys(TIER_3_ACTIONS)) {
  _actionTierMap.set(action, { tier: AutonomyTier.FORBIDDEN, meta: TIER_3_ACTIONS[action] });
}

const TIER_LABELS = Object.freeze({
  [AutonomyTier.FULL_AUTONOMY]: 'FULL_AUTONOMY',
  [AutonomyTier.AUTONOMOUS_WITH_NOTIFICATION]: 'AUTONOMOUS_WITH_NOTIFICATION',
  [AutonomyTier.HUMAN_APPROVAL_REQUIRED]: 'HUMAN_APPROVAL_REQUIRED',
  [AutonomyTier.FORBIDDEN]: 'FORBIDDEN',
});

/* ------------------------------------------------------------------ */
/*  Context-aware escalation rules                                   */
/* ------------------------------------------------------------------ */

/**
 * Evaluate whether context conditions should escalate the base tier.
 * @param {number} baseTier
 * @param {object} context
 * @returns {number} Potentially escalated tier (never de-escalates).
 */
function _applyContextEscalation(baseTier, context) {
  let tier = baseTier;

  // Audience size > 1L always requires approval
  if (context.audienceSize && context.audienceSize > 100000 && tier < AutonomyTier.HUMAN_APPROVAL_REQUIRED) {
    tier = AutonomyTier.HUMAN_APPROVAL_REQUIRED;
  }

  // Budget > 5L always requires approval
  if (context.budget && context.budget > 500000 && tier < AutonomyTier.HUMAN_APPROVAL_REQUIRED) {
    tier = AutonomyTier.HUMAN_APPROVAL_REQUIRED;
  }

  // Targeting minors always requires approval
  if (context.targetMinors && tier < AutonomyTier.HUMAN_APPROVAL_REQUIRED) {
    tier = AutonomyTier.HUMAN_APPROVAL_REQUIRED;
  }

  // If outside IST 9-21 for SMS, escalate to forbidden
  if (context.channel === 'SMS' && context.istHour !== undefined) {
    if (context.istHour < 9 || context.istHour >= 21) {
      tier = AutonomyTier.FORBIDDEN;
    }
  }

  // No consent → forbidden
  if (context.hasConsent === false) {
    tier = AutonomyTier.FORBIDDEN;
  }

  return tier;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                       */
/* ------------------------------------------------------------------ */

/**
 * Classify an action into an autonomy tier, accounting for runtime context.
 *
 * @param {string} actionType - One of the defined action names (e.g. 'DND_SCRUB').
 * @param {object} [context={}] - Runtime context that may escalate the tier.
 * @param {number} [context.audienceSize] - Target audience size.
 * @param {number} [context.budget] - Campaign budget in INR.
 * @param {boolean} [context.targetMinors] - Whether minors are targeted.
 * @param {string} [context.channel] - Delivery channel (SMS, EMAIL, PUSH, etc.).
 * @param {number} [context.istHour] - Current hour in IST (0-23).
 * @param {boolean} [context.hasConsent] - Whether user consent exists.
 * @returns {{ tier: number, tierLabel: string, action: string, description: string, condition: string, escalated: boolean, originalTier: number }}
 */
function classifyAction(actionType, context = {}) {
  const entry = _actionTierMap.get(actionType);

  if (!entry) {
    logger.warn('Unknown action type requested for classification', { actionType });
    return {
      tier: AutonomyTier.HUMAN_APPROVAL_REQUIRED,
      tierLabel: TIER_LABELS[AutonomyTier.HUMAN_APPROVAL_REQUIRED],
      action: actionType,
      description: 'Unknown action — defaulting to human approval',
      condition: 'Action not found in registry',
      escalated: false,
      originalTier: AutonomyTier.HUMAN_APPROVAL_REQUIRED,
    };
  }

  const baseTier = entry.tier;
  const finalTier = _applyContextEscalation(baseTier, context);
  const escalated = finalTier !== baseTier;

  if (escalated) {
    logger.info('Action tier escalated by context', {
      action: actionType,
      baseTier,
      finalTier,
      context,
    });
  }

  return {
    tier: finalTier,
    tierLabel: TIER_LABELS[finalTier],
    action: actionType,
    description: entry.meta.description,
    condition: entry.meta.condition,
    escalated,
    originalTier: baseTier,
  };
}

module.exports = {
  AutonomyTier,
  TIER_LABELS,
  TIER_0_ACTIONS,
  TIER_1_ACTIONS,
  TIER_2_ACTIONS,
  TIER_3_ACTIONS,
  classifyAction,
};
