/**
 * @module api/analytics
 * @description Express router for analytics and reporting endpoints.
 */

const express = require('express');
const { param, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { ExperimentService } = require('../services/upstream-services');

const router = express.Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }
  return null;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max, decimals = 2) {
  return +(Math.random() * (max - min) + min).toFixed(decimals);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------------------
// GET /api/analytics/overview - Platform-wide analytics
// ---------------------------------------------------------------------------

router.get(
  '/overview',
  [
    query('period').optional().isIn(['7d', '14d', '30d', '90d']).withMessage('Period must be 7d, 14d, 30d, or 90d'),
  ],
  (req, res) => {
    const validationError = handleValidation(req, res);
    if (validationError) return validationError;

    try {
      const period = req.query.period || '30d';
      const days = parseInt(period);

      const overview = {
        period,
        generatedAt: new Date().toISOString(),
        summary: {
          totalCampaigns: randomInt(20, 80),
          activeCampaigns: randomInt(5, 15),
          completedCampaigns: randomInt(10, 60),
          totalNudgesSent: randomInt(500000, 5000000),
          totalDelivered: randomInt(470000, 4800000),
          totalRevenue: randomInt(10000000, 100000000),
          avgROI: randomFloat(150, 400),
        },
        channelPerformance: {
          push: {
            sent: randomInt(200000, 2000000),
            deliveryRate: randomFloat(93, 98),
            openRate: randomFloat(15, 30),
            ctr: randomFloat(3, 10),
            conversionRate: randomFloat(1, 5),
          },
          sms: {
            sent: randomInt(100000, 800000),
            deliveryRate: randomFloat(95, 99),
            openRate: randomFloat(80, 95),
            ctr: randomFloat(2, 8),
            conversionRate: randomFloat(1, 4),
          },
          email: {
            sent: randomInt(150000, 1000000),
            deliveryRate: randomFloat(90, 96),
            openRate: randomFloat(18, 35),
            ctr: randomFloat(2, 7),
            conversionRate: randomFloat(0.5, 3),
          },
          whatsapp: {
            sent: randomInt(50000, 500000),
            deliveryRate: randomFloat(94, 99),
            openRate: randomFloat(70, 90),
            ctr: randomFloat(5, 15),
            conversionRate: randomFloat(2, 8),
          },
          in_app: {
            sent: randomInt(100000, 600000),
            deliveryRate: randomFloat(97, 100),
            openRate: randomFloat(40, 60),
            ctr: randomFloat(8, 20),
            conversionRate: randomFloat(3, 10),
          },
        },
        categoryPerformance: {
          electronics: { campaigns: randomInt(5, 15), revenue: randomInt(5000000, 30000000), avgConvRate: randomFloat(2, 6) },
          fashion: { campaigns: randomInt(4, 12), revenue: randomInt(3000000, 20000000), avgConvRate: randomFloat(1.5, 5) },
          grocery: { campaigns: randomInt(3, 10), revenue: randomInt(2000000, 15000000), avgConvRate: randomFloat(3, 8) },
          home: { campaigns: randomInt(2, 8), revenue: randomInt(1000000, 10000000), avgConvRate: randomFloat(1, 4) },
          beauty: { campaigns: randomInt(2, 6), revenue: randomInt(500000, 8000000), avgConvRate: randomFloat(2, 6) },
        },
        trends: {
          dailyNudgeVolume: Array.from({ length: Math.min(days, 30) }, (_, i) => ({
            date: new Date(Date.now() - (days - i) * 86400000).toISOString().slice(0, 10),
            sent: randomInt(15000, 200000),
            delivered: randomInt(14000, 190000),
            converted: randomInt(500, 8000),
          })),
          weeklyRevenue: Array.from({ length: Math.ceil(days / 7) }, (_, i) => ({
            week: `W${i + 1}`,
            revenue: randomInt(2000000, 25000000),
            campaigns: randomInt(3, 12),
          })),
        },
        topPerformingCampaigns: Array.from({ length: 5 }, (_, i) => ({
          campaignId: `cmp_top_${i + 1}`,
          name: `Top Campaign ${i + 1}`,
          channel: pick(['push', 'sms', 'email', 'whatsapp']),
          roi: randomFloat(200, 800),
          conversionRate: randomFloat(3, 12),
          revenue: randomInt(1000000, 15000000),
        })),
      };

      res.json({ success: true, data: overview });
    } catch (err) {
      logger.error('Error fetching analytics overview', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/analytics/campaigns/:id/report - Post-campaign report
// ---------------------------------------------------------------------------

router.get(
  '/campaigns/:id/report',
  [param('id').isString().trim().notEmpty()],
  (req, res) => {
    const validationError = handleValidation(req, res);
    if (validationError) return validationError;

    try {
      const campaignId = req.params.id;
      const totalSent = randomInt(50000, 300000);
      const delivered = Math.round(totalSent * randomFloat(0.92, 0.98));
      const opened = Math.round(delivered * randomFloat(0.15, 0.35));
      const clicked = Math.round(opened * randomFloat(0.2, 0.5));
      const converted = Math.round(clicked * randomFloat(0.1, 0.35));
      const revenue = converted * randomInt(500, 5000);
      const budget = randomInt(50000, 500000);

      const report = {
        campaignId,
        generatedAt: new Date().toISOString(),
        reportType: 'post_campaign',
        executionSummary: {
          status: 'completed',
          startedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
          completedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
          durationHours: randomInt(24, 120),
          channel: pick(['push', 'sms', 'email', 'whatsapp']),
          cohortSize: totalSent + randomInt(0, 5000),
        },
        funnel: {
          targeted: totalSent + randomInt(0, 5000),
          eligible: totalSent + randomInt(0, 2000),
          sent: totalSent,
          delivered,
          opened,
          clicked,
          converted,
          dropoffs: {
            consentFiltered: randomInt(100, 2000),
            dndFiltered: randomInt(50, 500),
            frequencyCapFiltered: randomInt(200, 3000),
            deliveryFailed: totalSent - delivered,
          },
        },
        financials: {
          budget,
          spent: Math.round(budget * randomFloat(0.85, 1.0)),
          revenue,
          roi: +(((revenue - budget) / budget) * 100).toFixed(2),
          costPerConversion: converted > 0 ? +(budget / converted).toFixed(2) : 0,
          revenuePerNudge: totalSent > 0 ? +(revenue / totalSent).toFixed(2) : 0,
        },
        segmentBreakdown: [
          { segment: 'high_value', sent: randomInt(10000, 50000), convRate: randomFloat(4, 12), revenue: randomInt(500000, 5000000) },
          { segment: 'deal_seeker', sent: randomInt(15000, 60000), convRate: randomFloat(3, 8), revenue: randomInt(300000, 3000000) },
          { segment: 'new_user', sent: randomInt(5000, 30000), convRate: randomFloat(1, 5), revenue: randomInt(100000, 1000000) },
          { segment: 'dormant', sent: randomInt(5000, 20000), convRate: randomFloat(0.5, 3), revenue: randomInt(50000, 500000) },
        ],
        timeSeriesPerformance: Array.from({ length: 7 }, (_, i) => ({
          date: new Date(Date.now() - (7 - i) * 86400000).toISOString().slice(0, 10),
          sent: randomInt(5000, 50000),
          delivered: randomInt(4500, 48000),
          clicked: randomInt(200, 5000),
          converted: randomInt(50, 1500),
        })),
        insights: [
          { type: 'positive', text: 'High-value segment showed 2.3x higher conversion than average' },
          { type: 'positive', text: 'Evening sends (6-9 PM) outperformed morning sends by 18%' },
          { type: 'negative', text: 'Dormant segment had below-average engagement; consider different creative' },
          { type: 'recommendation', text: 'A/B test with personalized subject lines could lift open rate by ~12%' },
          { type: 'recommendation', text: 'Reduce cohort overlap with "Weekend Deals" campaign for next run' },
        ],
      };

      res.json({ success: true, data: report });
    } catch (err) {
      logger.error('Error generating campaign report', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/analytics/experiments/:id/results - A/B test results
// ---------------------------------------------------------------------------

router.get(
  '/experiments/:id/results',
  [param('id').isString().trim().notEmpty()],
  async (req, res) => {
    const validationError = handleValidation(req, res);
    if (validationError) return validationError;

    try {
      const experimentId = req.params.id;

      // Fetch from upstream ExperimentService
      const upstreamResults = await ExperimentService.getResults(experimentId);

      const controlConv = upstreamResults.variants.control.conversionRate;
      const variantConv = upstreamResults.variants.variant_a.conversionRate;
      const lift = controlConv > 0 ? +(((variantConv - controlConv) / controlConv) * 100).toFixed(2) : 0;

      const results = {
        experimentId,
        status: upstreamResults.status,
        sampleSize: upstreamResults.sampleSize,
        startedAt: new Date(Date.now() - 14 * 86400000).toISOString(),
        lastUpdated: upstreamResults.computedAt,
        variants: {
          control: {
            name: 'Control',
            allocation: 50,
            ...upstreamResults.variants.control,
            revenuePerUser: randomFloat(50, 300),
          },
          variant_a: {
            name: 'Variant A',
            allocation: 50,
            ...upstreamResults.variants.variant_a,
            revenuePerUser: randomFloat(50, 300),
          },
        },
        statisticalAnalysis: {
          significanceLevel: 0.05,
          pValue: +(1 - upstreamResults.statisticalSignificance).toFixed(4),
          isSignificant: upstreamResults.statisticalSignificance > 0.95,
          confidenceInterval: {
            lower: +(lift - randomFloat(2, 5)).toFixed(2),
            upper: +(lift + randomFloat(2, 5)).toFixed(2),
          },
          lift,
          winner: lift > 0 ? 'variant_a' : 'control',
          confidence: upstreamResults.confidence,
        },
        recommendation: lift > 5 && upstreamResults.statisticalSignificance > 0.95
          ? 'Variant A shows significant improvement. Recommend promoting to 100% traffic.'
          : lift > 0
            ? 'Variant A shows marginal improvement but results are not yet statistically significant. Continue testing.'
            : 'Control is performing equal or better. Consider a new hypothesis.',
        dailyTrend: Array.from({ length: 14 }, (_, i) => ({
          date: new Date(Date.now() - (14 - i) * 86400000).toISOString().slice(0, 10),
          controlConvRate: randomFloat(1, 5),
          variantConvRate: randomFloat(1, 6),
          cumulativeSampleSize: (i + 1) * Math.round(upstreamResults.sampleSize / 14),
        })),
      };

      res.json({ success: true, data: results });
    } catch (err) {
      logger.error('Error fetching experiment results', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/analytics/learnings - Learning loop insights
// ---------------------------------------------------------------------------

router.get('/learnings', (req, res) => {
  try {
    const learnings = {
      generatedAt: new Date().toISOString(),
      totalLearnings: 12,
      learnings: [
        {
          id: `lrn_${uuidv4().slice(0, 8)}`,
          category: 'timing',
          insight: 'Push notifications sent between 6-8 PM IST consistently achieve 23% higher open rates',
          confidence: 0.94,
          basedOn: { campaigns: 18, dataPoints: 450000 },
          actionable: true,
          suggestedAction: 'Schedule push campaigns for 6-8 PM IST window',
          discoveredAt: new Date(Date.now() - 3 * 86400000).toISOString(),
        },
        {
          id: `lrn_${uuidv4().slice(0, 8)}`,
          category: 'personalization',
          insight: 'Personalized product recommendations in nudges yield 3.1x higher CTR vs generic offers',
          confidence: 0.91,
          basedOn: { campaigns: 12, dataPoints: 320000 },
          actionable: true,
          suggestedAction: 'Always include top-3 personalized recommendations in nudge content',
          discoveredAt: new Date(Date.now() - 5 * 86400000).toISOString(),
        },
        {
          id: `lrn_${uuidv4().slice(0, 8)}`,
          category: 'channel',
          insight: 'WhatsApp channel shows highest conversion rate for grocery category (8.2% avg)',
          confidence: 0.88,
          basedOn: { campaigns: 8, dataPoints: 180000 },
          actionable: true,
          suggestedAction: 'Prioritize WhatsApp for grocery campaigns',
          discoveredAt: new Date(Date.now() - 7 * 86400000).toISOString(),
        },
        {
          id: `lrn_${uuidv4().slice(0, 8)}`,
          category: 'fatigue',
          insight: 'Users receiving more than 2 nudges per day show 40% drop in engagement on day 3',
          confidence: 0.96,
          basedOn: { campaigns: 25, dataPoints: 800000 },
          actionable: true,
          suggestedAction: 'Enforce strict 2 nudges/day cap across all channels',
          discoveredAt: new Date(Date.now() - 10 * 86400000).toISOString(),
        },
        {
          id: `lrn_${uuidv4().slice(0, 8)}`,
          category: 'segment',
          insight: 'Deal-seeker segment responds best to price-drop nudges with exact savings amount',
          confidence: 0.89,
          basedOn: { campaigns: 15, dataPoints: 280000 },
          actionable: true,
          suggestedAction: 'Include exact savings amount (e.g., "Save Rs 1,200") in deal-seeker nudges',
          discoveredAt: new Date(Date.now() - 12 * 86400000).toISOString(),
        },
        {
          id: `lrn_${uuidv4().slice(0, 8)}`,
          category: 'creative',
          insight: 'Emojis in push notification titles increase open rate by 8% for users under 30',
          confidence: 0.82,
          basedOn: { campaigns: 6, dataPoints: 120000 },
          actionable: true,
          suggestedAction: 'Use emojis for campaigns targeting younger demographics',
          discoveredAt: new Date(Date.now() - 14 * 86400000).toISOString(),
        },
      ],
      modelVersion: '2.3.1',
      nextRefresh: new Date(Date.now() + 86400000).toISOString(),
    };

    res.json({ success: true, data: learnings });
  } catch (err) {
    logger.error('Error fetching learnings', { error: err.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/analytics/opportunities - Proactive opportunity suggestions
// ---------------------------------------------------------------------------

router.get('/opportunities', (req, res) => {
  try {
    const opportunities = {
      generatedAt: new Date().toISOString(),
      total: 5,
      opportunities: [
        {
          id: `opp_${uuidv4().slice(0, 8)}`,
          type: 'price_drop',
          title: 'Price Drop Alert: Samsung Galaxy S24',
          description: '12,340 users have this product in their wishlist. Price dropped 22% today.',
          estimatedReach: 12340,
          estimatedConvRate: 8.5,
          estimatedRevenue: 52400000,
          urgency: 'high',
          suggestedAction: 'Launch push notification campaign within 2 hours',
          suggestedChannel: 'push',
          suggestedCohort: { segment: 'wishlist_samsung_galaxy', size: 12340 },
          expiresAt: new Date(Date.now() + 4 * 3600000).toISOString(),
        },
        {
          id: `opp_${uuidv4().slice(0, 8)}`,
          type: 'cart_abandonment',
          title: 'Cart Abandonment Wave Detected',
          description: '8,920 users abandoned carts in the last 6 hours with avg value Rs 2,340',
          estimatedReach: 8920,
          estimatedConvRate: 12.3,
          estimatedRevenue: 25700000,
          urgency: 'high',
          suggestedAction: 'Send cart reminder with 5% discount code via WhatsApp',
          suggestedChannel: 'whatsapp',
          suggestedCohort: { segment: 'cart_abandoners_6h', size: 8920 },
          expiresAt: new Date(Date.now() + 2 * 3600000).toISOString(),
        },
        {
          id: `opp_${uuidv4().slice(0, 8)}`,
          type: 'restock',
          title: 'Popular Item Back in Stock',
          description: 'boAt Airdopes 141 back in stock. 5,600 users had notify-me alerts.',
          estimatedReach: 5600,
          estimatedConvRate: 15.2,
          estimatedRevenue: 4200000,
          urgency: 'medium',
          suggestedAction: 'Send back-in-stock notification via push and email',
          suggestedChannel: 'push',
          suggestedCohort: { segment: 'notify_me_boat_141', size: 5600 },
          expiresAt: new Date(Date.now() + 12 * 3600000).toISOString(),
        },
        {
          id: `opp_${uuidv4().slice(0, 8)}`,
          type: 'seasonal',
          title: 'Holi Festival Approaching',
          description: 'Holi in 5 days. Color/party supplies searches up 340% week-over-week.',
          estimatedReach: 45000,
          estimatedConvRate: 4.8,
          estimatedRevenue: 8100000,
          urgency: 'medium',
          suggestedAction: 'Launch Holi deals campaign across all channels',
          suggestedChannel: 'email',
          suggestedCohort: { segment: 'holi_interest_cohort', size: 45000 },
          expiresAt: new Date(Date.now() + 3 * 86400000).toISOString(),
        },
        {
          id: `opp_${uuidv4().slice(0, 8)}`,
          type: 'reengagement',
          title: 'Dormant High-Value Users',
          description: '3,200 platinum users inactive for 30+ days. Historical reactivation rate: 18%',
          estimatedReach: 3200,
          estimatedConvRate: 18.0,
          estimatedRevenue: 11520000,
          urgency: 'low',
          suggestedAction: 'Send personalized re-engagement with exclusive offer via email',
          suggestedChannel: 'email',
          suggestedCohort: { segment: 'dormant_platinum_30d', size: 3200 },
          expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        },
      ],
    };

    res.json({ success: true, data: opportunities });
  } catch (err) {
    logger.error('Error fetching opportunities', { error: err.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;
