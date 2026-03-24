/**
 * @module decision-intelligence
 * @description Decision intelligence layer: fatigue scoring, channel ranking,
 *              campaign priority arbitration, conflict resolution, and
 *              proactive opportunity detection.
 */

const logger = require('../utils/logger');

/* ================================================================== */
/*  1. Fatigue Scoring                                                */
/* ================================================================== */

/**
 * Fatigue score thresholds and their semantic categories.
 * @readonly
 */
const FATIGUE_THRESHOLDS = Object.freeze({
  HEALTHY:  { min: 0,  max: 30,  label: 'healthy' },
  CAUTION:  { min: 31, max: 60,  label: 'caution' },
  AT_RISK:  { min: 61, max: 80,  label: 'at-risk' },
  CRITICAL: { min: 81, max: 100, label: 'critical' },
});

/**
 * Calculate a fatigue score (0-100) for a user.
 *
 * Inputs and their weights:
 *   - messages_received_7d      (weight 0.20)
 *   - messages_dismissed_7d     (weight 0.25)
 *   - time_since_last_purchase  (weight 0.15, days — higher = more fatigued)
 *   - unsubscribe_attempts      (weight 0.20)
 *   - notification_disable_events (weight 0.10)
 *   - channel_preference_mismatch (weight 0.10, boolean → 0 or 1)
 *
 * Each dimension is normalised to 0-1 then the weighted sum is scaled to 0-100.
 *
 * @param {object} userData
 * @param {number} userData.messages_received_7d
 * @param {number} userData.messages_dismissed_7d
 * @param {number} userData.time_since_last_purchase - Days since last purchase.
 * @param {number} userData.unsubscribe_attempts
 * @param {number} userData.notification_disable_events
 * @param {boolean|number} userData.channel_preference_mismatch
 * @returns {number} Score between 0 and 100.
 */
function calculateFatigueScore(userData) {
  const {
    messages_received_7d = 0,
    messages_dismissed_7d = 0,
    time_since_last_purchase = 0,
    unsubscribe_attempts = 0,
    notification_disable_events = 0,
    channel_preference_mismatch = false,
  } = userData;

  // Normalisation ceilings (values above these are clamped to 1.0)
  const normReceived = Math.min(messages_received_7d / 30, 1);
  const normDismissed = Math.min(messages_dismissed_7d / 20, 1);
  const normPurchaseGap = Math.min(time_since_last_purchase / 90, 1);
  const normUnsub = Math.min(unsubscribe_attempts / 5, 1);
  const normDisable = Math.min(notification_disable_events / 3, 1);
  const normMismatch = channel_preference_mismatch ? 1 : 0;

  const weights = {
    received: 0.20,
    dismissed: 0.25,
    purchaseGap: 0.15,
    unsub: 0.20,
    disable: 0.10,
    mismatch: 0.10,
  };

  const raw =
    normReceived * weights.received +
    normDismissed * weights.dismissed +
    normPurchaseGap * weights.purchaseGap +
    normUnsub * weights.unsub +
    normDisable * weights.disable +
    normMismatch * weights.mismatch;

  const score = Math.round(Math.min(raw * 100, 100));

  logger.debug('Fatigue score calculated', { userId: userData.userId, score });

  return score;
}

/**
 * Return the fatigue category and associated messaging rules.
 *
 * @param {number} score - Fatigue score 0-100.
 * @returns {{ category: string, rules: object }}
 */
function getFatigueCategory(score) {
  if (score <= FATIGUE_THRESHOLDS.HEALTHY.max) {
    return {
      category: 'healthy',
      score,
      rules: {
        maxMessagesPerDay: 3,
        allowPromotional: true,
        requireHighRelevance: false,
        cooldownHours: 0,
        notes: 'Normal messaging cadence. No restrictions.',
      },
    };
  }

  if (score <= FATIGUE_THRESHOLDS.CAUTION.max) {
    return {
      category: 'caution',
      score,
      rules: {
        maxMessagesPerDay: 2,
        allowPromotional: true,
        requireHighRelevance: true,
        cooldownHours: 4,
        notes: 'Reduce frequency. Prioritise high-relevance content only.',
      },
    };
  }

  if (score <= FATIGUE_THRESHOLDS.AT_RISK.max) {
    return {
      category: 'at-risk',
      score,
      rules: {
        maxMessagesPerDay: 1,
        allowPromotional: false,
        requireHighRelevance: true,
        cooldownHours: 12,
        notes: 'Promotional messages suppressed. Only transactional and high-value triggers.',
      },
    };
  }

  return {
    category: 'critical',
    score,
    rules: {
      maxMessagesPerDay: 0,
      allowPromotional: false,
      requireHighRelevance: true,
      cooldownHours: 48,
      notes: 'All non-essential messages suppressed. Only critical transactional messages allowed.',
    },
  };
}

/* ================================================================== */
/*  2. Channel Affinity Scoring                                       */
/* ================================================================== */

/**
 * Calculate a channel affinity score for a given user + channel combination.
 *
 * @param {string} userId
 * @param {string} channel - e.g. 'PUSH', 'SMS', 'EMAIL', 'WHATSAPP', 'IN_APP'
 * @param {object} historicalData
 * @param {number} [historicalData.open_rate=0]    - 0-1
 * @param {number} [historicalData.click_rate=0]   - 0-1
 * @param {number} [historicalData.conversion_rate=0] - 0-1
 * @param {number} [historicalData.dismiss_rate=0] - 0-1
 * @param {number} [historicalData.opt_out_rate=0] - 0-1
 * @param {number} [historicalData.response_time_minutes=60] - Avg minutes to respond
 * @returns {{ channel: string, score: number, breakdown: object }}
 */
function calculateChannelScore(userId, channel, historicalData = {}) {
  const {
    open_rate = 0,
    click_rate = 0,
    conversion_rate = 0,
    dismiss_rate = 0,
    opt_out_rate = 0,
    response_time_minutes = 60,
  } = historicalData;

  // Positive signals
  const openScore = open_rate * 25;
  const clickScore = click_rate * 30;
  const conversionScore = conversion_rate * 25;

  // Negative signals
  const dismissPenalty = dismiss_rate * 15;
  const optOutPenalty = opt_out_rate * 20;

  // Speed bonus (faster response = higher score, caps at 10)
  const speedBonus = Math.max(0, 10 - (response_time_minutes / 60) * 5);

  const rawScore = openScore + clickScore + conversionScore - dismissPenalty - optOutPenalty + speedBonus;
  const score = Math.round(Math.max(0, Math.min(100, rawScore)));

  return {
    channel,
    score,
    breakdown: {
      openScore: Math.round(openScore * 100) / 100,
      clickScore: Math.round(clickScore * 100) / 100,
      conversionScore: Math.round(conversionScore * 100) / 100,
      dismissPenalty: Math.round(dismissPenalty * 100) / 100,
      optOutPenalty: Math.round(optOutPenalty * 100) / 100,
      speedBonus: Math.round(speedBonus * 100) / 100,
    },
  };
}

/**
 * Rank all channels for a user by affinity score.
 *
 * @param {string} userId
 * @param {Object<string, object>} historicalData - Map of channel → historical metrics.
 * @returns {Array<{ channel: string, score: number, rank: number, breakdown: object }>}
 */
function rankChannels(userId, historicalData = {}) {
  const channels = Object.keys(historicalData);

  if (channels.length === 0) {
    // Default ranking when no data is available
    return [
      { channel: 'PUSH', score: 50, rank: 1, breakdown: {} },
      { channel: 'IN_APP', score: 45, rank: 2, breakdown: {} },
      { channel: 'EMAIL', score: 40, rank: 3, breakdown: {} },
      { channel: 'WHATSAPP', score: 35, rank: 4, breakdown: {} },
      { channel: 'SMS', score: 30, rank: 5, breakdown: {} },
    ];
  }

  const scored = channels.map((ch) => calculateChannelScore(userId, ch, historicalData[ch]));
  scored.sort((a, b) => b.score - a.score);

  return scored.map((item, idx) => ({ ...item, rank: idx + 1 }));
}

/* ================================================================== */
/*  3. Campaign Priority Arbitration                                  */
/* ================================================================== */

/**
 * Calculate a composite priority score for a campaign targeting a user.
 *
 * @param {object} campaign
 * @param {number} [campaign.business_value=0]    - 0-100
 * @param {number} [campaign.time_sensitivity=0]  - 0-100
 * @param {number} [campaign.approval_level=0]    - 0 (auto) to 3 (exec-approved)
 * @param {object} user
 * @param {number} [user.relevance_score=0]       - 0-100 personalisation score
 * @param {string} [user.lifecycle_stage='active'] - new, active, at-risk, dormant, churned
 * @returns {{ priority: number, breakdown: object }}
 */
function calculateCampaignPriority(campaign = {}, user = {}) {
  const businessValue = campaign.business_value || 0;
  const timeSensitivity = campaign.time_sensitivity || 0;
  const approvalLevel = campaign.approval_level || 0;
  const relevanceScore = user.relevance_score || 0;
  const lifecycleStage = user.lifecycle_stage || 'active';

  const lifecycleMultipliers = {
    new: 1.3,
    active: 1.0,
    'at-risk': 1.2,
    dormant: 0.7,
    churned: 0.4,
  };
  const lifecycleMultiplier = lifecycleMultipliers[lifecycleStage] || 1.0;

  const weights = {
    business_value: 0.30,
    time_sensitivity: 0.20,
    relevance: 0.30,
    approval: 0.10,
    lifecycle: 0.10,
  };

  const approvalBoost = (approvalLevel / 3) * 100;
  const lifecycleScore = lifecycleMultiplier * 50;

  const raw =
    businessValue * weights.business_value +
    timeSensitivity * weights.time_sensitivity +
    relevanceScore * weights.relevance +
    approvalBoost * weights.approval +
    lifecycleScore * weights.lifecycle;

  const priority = Math.round(Math.min(raw, 100));

  return {
    priority,
    breakdown: {
      businessValue: Math.round(businessValue * weights.business_value * 100) / 100,
      timeSensitivity: Math.round(timeSensitivity * weights.time_sensitivity * 100) / 100,
      relevance: Math.round(relevanceScore * weights.relevance * 100) / 100,
      approvalBoost: Math.round(approvalBoost * weights.approval * 100) / 100,
      lifecycleScore: Math.round(lifecycleScore * weights.lifecycle * 100) / 100,
      lifecycleMultiplier,
    },
  };
}

/**
 * When multiple campaigns target the same user at the same time,
 * resolve conflicts by picking the winner and deferring the rest.
 *
 * @param {object[]} campaigns - Array of campaign objects.
 * @param {string} userId
 * @param {object} [userProfile={}] - User profile with relevance & lifecycle data.
 * @returns {{ winner: object, deferred: object[], rankings: object[] }}
 */
function resolveConflicts(campaigns, userId, userProfile = {}) {
  if (!campaigns || campaigns.length === 0) {
    return { winner: null, deferred: [], rankings: [] };
  }

  if (campaigns.length === 1) {
    const priority = calculateCampaignPriority(campaigns[0], userProfile);
    return {
      winner: { ...campaigns[0], priority: priority.priority },
      deferred: [],
      rankings: [{ campaignId: campaigns[0].id, priority: priority.priority, breakdown: priority.breakdown }],
    };
  }

  const rankings = campaigns.map((c) => {
    const p = calculateCampaignPriority(c, userProfile);
    return {
      campaign: c,
      campaignId: c.id,
      priority: p.priority,
      breakdown: p.breakdown,
    };
  });

  rankings.sort((a, b) => b.priority - a.priority);

  const winner = { ...rankings[0].campaign, priority: rankings[0].priority };
  const deferred = rankings.slice(1).map((r) => ({
    ...r.campaign,
    priority: r.priority,
    deferReason: `Lower priority than campaign ${winner.id} (${r.priority} vs ${rankings[0].priority})`,
  }));

  logger.info('Campaign conflict resolved', {
    userId,
    winnerId: winner.id,
    deferredIds: deferred.map((d) => d.id),
  });

  return {
    winner,
    deferred,
    rankings: rankings.map((r) => ({
      campaignId: r.campaignId,
      priority: r.priority,
      breakdown: r.breakdown,
    })),
  };
}

/* ================================================================== */
/*  4. Proactive Opportunity Detection                                */
/* ================================================================== */

/**
 * Scan market and campaign data to proactively detect nudge opportunities.
 *
 * @param {object} marketData
 * @param {string[]} [marketData.trending_categories=[]]  - Currently trending categories.
 * @param {string[]} [marketData.upcoming_events=[]]      - Upcoming sale events / festivals.
 * @param {object}   [marketData.weather={}]              - Weather conditions by region.
 * @param {object}   [marketData.inventory_alerts={}]     - Low/high stock alerts.
 * @param {object} campaignData
 * @param {object[]} [campaignData.active_campaigns=[]]   - Currently active campaigns.
 * @param {object[]} [campaignData.recent_performance=[]] - Recent campaign performance metrics.
 * @param {object[]} [campaignData.dormant_segments=[]]   - Segments with no recent campaigns.
 * @returns {{ opportunities: object[], generatedAt: string }}
 */
function detectOpportunities(marketData = {}, campaignData = {}) {
  const opportunities = [];

  const trendingCategories = marketData.trending_categories || [];
  const upcomingEvents = marketData.upcoming_events || [];
  const weather = marketData.weather || {};
  const inventoryAlerts = marketData.inventory_alerts || {};
  const activeCampaigns = campaignData.active_campaigns || [];
  const recentPerformance = campaignData.recent_performance || [];
  const dormantSegments = campaignData.dormant_segments || [];

  // Opportunity 1: Trending category without active campaign
  const activeCategorySet = new Set(activeCampaigns.map((c) => c.category).filter(Boolean));
  for (const category of trendingCategories) {
    if (!activeCategorySet.has(category)) {
      opportunities.push({
        type: 'TRENDING_CATEGORY_GAP',
        priority: 'HIGH',
        description: `Category "${category}" is trending but has no active campaign`,
        suggestedAction: 'LAUNCH_NEW_CAMPAIGN',
        data: { category },
      });
    }
  }

  // Opportunity 2: Upcoming event preparation
  for (const event of upcomingEvents) {
    opportunities.push({
      type: 'UPCOMING_EVENT',
      priority: 'MEDIUM',
      description: `Upcoming event "${event.name || event}" — consider pre-event nudge campaign`,
      suggestedAction: 'LAUNCH_NEW_CAMPAIGN',
      data: { event },
    });
  }

  // Opportunity 3: Weather-driven opportunities
  for (const [region, conditions] of Object.entries(weather)) {
    if (conditions.extreme) {
      opportunities.push({
        type: 'WEATHER_TRIGGER',
        priority: 'MEDIUM',
        description: `Extreme weather in ${region}: ${conditions.description || 'adverse conditions'}`,
        suggestedAction: 'LAUNCH_NEW_CAMPAIGN',
        data: { region, conditions },
      });
    }
  }

  // Opportunity 4: Inventory-driven urgency
  for (const [sku, alert] of Object.entries(inventoryAlerts)) {
    if (alert.status === 'LOW_STOCK') {
      opportunities.push({
        type: 'LOW_STOCK_URGENCY',
        priority: 'HIGH',
        description: `SKU ${sku} running low — nudge users with item in cart/wishlist`,
        suggestedAction: 'SHIFT_SEND_TIME',
        data: { sku, ...alert },
      });
    }
    if (alert.status === 'OVERSTOCK') {
      opportunities.push({
        type: 'OVERSTOCK_CLEARANCE',
        priority: 'LOW',
        description: `SKU ${sku} overstocked — consider discount campaign`,
        suggestedAction: 'LAUNCH_NEW_CAMPAIGN',
        data: { sku, ...alert },
      });
    }
  }

  // Opportunity 5: Under-performing campaigns
  for (const perf of recentPerformance) {
    if (perf.ctr !== undefined && perf.ctr < 0.01) {
      opportunities.push({
        type: 'LOW_PERFORMING_CAMPAIGN',
        priority: 'HIGH',
        description: `Campaign "${perf.campaignId || perf.name}" has CTR below 1% — consider creative swap`,
        suggestedAction: 'SWAP_CREATIVE_VARIANT',
        data: { campaignId: perf.campaignId, ctr: perf.ctr },
      });
    }
  }

  // Opportunity 6: Dormant segments re-engagement
  for (const segment of dormantSegments) {
    opportunities.push({
      type: 'DORMANT_SEGMENT',
      priority: 'MEDIUM',
      description: `Segment "${segment.name || segment.id}" has had no campaigns for ${segment.daysSinceLastCampaign || 'unknown'} days`,
      suggestedAction: 'LAUNCH_NEW_CAMPAIGN',
      data: { segment },
    });
  }

  // Sort by priority
  const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  opportunities.sort((a, b) => (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99));

  logger.info('Opportunity detection completed', { count: opportunities.length });

  return {
    opportunities,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  FATIGUE_THRESHOLDS,
  calculateFatigueScore,
  getFatigueCategory,
  calculateChannelScore,
  rankChannels,
  calculateCampaignPriority,
  resolveConflicts,
  detectOpportunities,
};
