/**
 * @module api/monitoring
 * @description Express router for real-time monitoring endpoints.
 */

const express = require('express');
const { param, body, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { DeliveryInfrastructure } = require('../services/upstream-services');

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

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// In-memory alerts store
const alerts = new Map();

function seedAlerts() {
  const items = [
    {
      id: 'alert_001',
      type: 'delivery_rate_drop',
      severity: 'high',
      message: 'Push delivery rate dropped below 90% for campaign cmp_001',
      campaignId: 'cmp_001',
      detectedAt: new Date(Date.now() - 1800000).toISOString(),
      acknowledged: false,
      acknowledgedBy: null,
      acknowledgedAt: null,
    },
    {
      id: 'alert_002',
      type: 'frequency_cap_breach',
      severity: 'medium',
      message: '342 users exceeded daily frequency cap on SMS channel',
      campaignId: null,
      detectedAt: new Date(Date.now() - 3600000).toISOString(),
      acknowledged: false,
      acknowledgedBy: null,
      acknowledgedAt: null,
    },
    {
      id: 'alert_003',
      type: 'consent_anomaly',
      severity: 'critical',
      message: 'Consent service returned stale data for 1,200 users in last batch',
      campaignId: 'cmp_002',
      detectedAt: new Date(Date.now() - 600000).toISOString(),
      acknowledged: false,
      acknowledgedBy: null,
      acknowledgedAt: null,
    },
  ];
  for (const a of items) alerts.set(a.id, a);
}

seedAlerts();

// ---------------------------------------------------------------------------
// GET /api/monitoring/dashboard - Real-time dashboard data
// ---------------------------------------------------------------------------

router.get('/dashboard', async (req, res) => {
  try {
    const deliveryStats = await DeliveryInfrastructure.getDeliveryStats();

    const dashboard = {
      timestamp: new Date().toISOString(),
      liveCampaigns: {
        total: randomInt(5, 15),
        active: randomInt(3, 10),
        paused: randomInt(0, 3),
        pending_approval: randomInt(0, 4),
      },
      deliveryHealth: {
        overallDeliveryRate: deliveryStats.stats.deliveryRate,
        channelRates: {
          push: +(Math.random() * 5 + 93).toFixed(2),
          sms: +(Math.random() * 3 + 95).toFixed(2),
          email: +(Math.random() * 5 + 90).toFixed(2),
          whatsapp: +(Math.random() * 4 + 94).toFixed(2),
          in_app: +(Math.random() * 2 + 97).toFixed(2),
        },
        avgLatencyMs: deliveryStats.stats.avgLatencyMs,
        provider: deliveryStats.provider,
      },
      throughput: {
        messagesPerMinute: randomInt(500, 5000),
        messagesLast1h: randomInt(30000, 300000),
        messagesLast24h: deliveryStats.stats.totalSent,
      },
      systemHealth: {
        status: 'healthy',
        uptime: `${randomInt(10, 90)}d ${randomInt(0, 23)}h ${randomInt(0, 59)}m`,
        cpuUsage: +(Math.random() * 30 + 10).toFixed(1),
        memoryUsage: +(Math.random() * 20 + 40).toFixed(1),
        serviceStatuses: {
          userProfileService: 'up',
          behaviourStream: 'up',
          recommendationService: 'up',
          pricingService: 'up',
          inventoryService: 'up',
          consentService: Math.random() > 0.95 ? 'degraded' : 'up',
          frequencyCapService: 'up',
          deliveryInfrastructure: 'up',
          dndRegistry: 'up',
        },
      },
      activeAlerts: Array.from(alerts.values()).filter((a) => !a.acknowledged),
      recentActivity: [
        { action: 'campaign.started', campaignId: 'cmp_001', timestamp: new Date(Date.now() - 3600000).toISOString() },
        { action: 'cohort.built', cohortId: 'coh_abc123', size: 125000, timestamp: new Date(Date.now() - 7200000).toISOString() },
        { action: 'experiment.created', experimentId: 'exp_001', timestamp: new Date(Date.now() - 10800000).toISOString() },
        { action: 'campaign.approved', campaignId: 'cmp_002', timestamp: new Date(Date.now() - 14400000).toISOString() },
      ],
    };

    res.json({ success: true, data: dashboard });
  } catch (err) {
    logger.error('Error fetching dashboard data', { error: err.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/monitoring/campaigns/:id/health - Campaign health metrics
// ---------------------------------------------------------------------------

router.get(
  '/campaigns/:id/health',
  [param('id').isString().trim().notEmpty()],
  (req, res) => {
    const validationError = handleValidation(req, res);
    if (validationError) return validationError;

    try {
      const campaignId = req.params.id;

      const health = {
        campaignId,
        status: pick(['healthy', 'healthy', 'healthy', 'warning', 'critical']),
        checkedAt: new Date().toISOString(),
        delivery: {
          sent: randomInt(10000, 200000),
          delivered: randomInt(9000, 190000),
          failed: randomInt(100, 5000),
          pending: randomInt(0, 2000),
          deliveryRate: +(Math.random() * 5 + 93).toFixed(2),
          bounceRate: +(Math.random() * 3).toFixed(2),
        },
        engagement: {
          opened: randomInt(2000, 50000),
          clicked: randomInt(500, 15000),
          converted: randomInt(100, 5000),
          unsubscribed: randomInt(0, 200),
          openRate: +(Math.random() * 20 + 10).toFixed(2),
          ctr: +(Math.random() * 8 + 2).toFixed(2),
        },
        pacing: {
          expectedSentByNow: randomInt(50000, 150000),
          actualSent: randomInt(45000, 160000),
          pacingStatus: pick(['on_track', 'on_track', 'ahead', 'behind']),
          estimatedCompletion: new Date(Date.now() + randomInt(1, 48) * 3600000).toISOString(),
        },
        qualitySignals: {
          spamComplaintRate: +(Math.random() * 0.05).toFixed(4),
          fatigueScore: +(Math.random() * 40 + 10).toFixed(1),
          sentimentScore: +(Math.random() * 0.4 + 0.5).toFixed(2),
          consentCompliance: true,
          frequencyCapCompliance: Math.random() > 0.05,
        },
        alerts: Array.from(alerts.values())
          .filter((a) => a.campaignId === campaignId && !a.acknowledged)
          .slice(0, 5),
      };

      res.json({ success: true, data: health });
    } catch (err) {
      logger.error('Error fetching campaign health', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/monitoring/anomalies - Current anomalies detected
// ---------------------------------------------------------------------------

router.get(
  '/anomalies',
  [
    query('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  (req, res) => {
    const validationError = handleValidation(req, res);
    if (validationError) return validationError;

    try {
      const { severity, limit = 20 } = req.query;

      const anomalyTypes = [
        {
          type: 'delivery_rate_anomaly',
          severity: 'high',
          description: 'Push delivery rate dropped 12% below 7-day average',
          metric: 'delivery_rate',
          expectedValue: 96.5,
          actualValue: 84.3,
          deviation: -12.2,
          affectedCampaign: 'cmp_001',
        },
        {
          type: 'engagement_spike',
          severity: 'medium',
          description: 'Unusual CTR spike detected on email campaign — possible bot activity',
          metric: 'click_through_rate',
          expectedValue: 3.2,
          actualValue: 14.8,
          deviation: 11.6,
          affectedCampaign: 'cmp_003',
        },
        {
          type: 'consent_service_latency',
          severity: 'high',
          description: 'Consent service P99 latency exceeded 2s threshold',
          metric: 'service_latency_ms',
          expectedValue: 200,
          actualValue: 2340,
          deviation: 2140,
          affectedCampaign: null,
        },
        {
          type: 'frequency_cap_breach',
          severity: 'critical',
          description: '458 users received more than daily cap on push channel',
          metric: 'cap_breaches',
          expectedValue: 0,
          actualValue: 458,
          deviation: 458,
          affectedCampaign: null,
        },
        {
          type: 'unsubscribe_surge',
          severity: 'medium',
          description: 'Unsubscribe rate 3x above normal for SMS channel',
          metric: 'unsubscribe_rate',
          expectedValue: 0.1,
          actualValue: 0.32,
          deviation: 0.22,
          affectedCampaign: 'cmp_002',
        },
        {
          type: 'revenue_underperformance',
          severity: 'low',
          description: 'Campaign revenue tracking 18% below projection',
          metric: 'revenue_vs_projection',
          expectedValue: 1500000,
          actualValue: 1230000,
          deviation: -270000,
          affectedCampaign: 'cmp_001',
        },
      ];

      let results = anomalyTypes.map((a) => ({
        id: `anom_${uuidv4().slice(0, 8)}`,
        ...a,
        detectedAt: new Date(Date.now() - randomInt(300, 7200) * 1000).toISOString(),
        status: pick(['active', 'active', 'investigating', 'resolved']),
      }));

      if (severity) {
        results = results.filter((a) => a.severity === severity);
      }

      results = results.slice(0, limit);

      res.json({
        success: true,
        data: {
          anomalies: results,
          total: results.length,
          lastScanAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      logger.error('Error fetching anomalies', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/monitoring/compliance - Compliance health report
// ---------------------------------------------------------------------------

router.get('/compliance', (req, res) => {
  try {
    const report = {
      generatedAt: new Date().toISOString(),
      overallStatus: 'compliant',
      consentCompliance: {
        status: 'pass',
        totalMessagesSent: randomInt(200000, 500000),
        withValidConsent: randomInt(195000, 500000),
        withoutConsent: randomInt(0, 50),
        consentRate: +(Math.random() * 0.5 + 99.5).toFixed(2),
        violations: [],
      },
      dndCompliance: {
        status: 'pass',
        dndChecksPerformed: randomInt(100000, 300000),
        dndViolations: 0,
        lastCheckAt: new Date().toISOString(),
      },
      frequencyCapping: {
        status: Math.random() > 0.9 ? 'warning' : 'pass',
        capsEnforced: randomInt(50000, 200000),
        capBreaches: randomInt(0, 50),
        breachRate: +(Math.random() * 0.02).toFixed(4),
      },
      dataPrivacy: {
        status: 'pass',
        piiExposures: 0,
        dataRetentionCompliant: true,
        encryptionStatus: 'aes-256-gcm',
        lastAudit: new Date(Date.now() - 7 * 86400000).toISOString(),
      },
      quietHours: {
        status: 'pass',
        violationsLast24h: 0,
        configuredWindow: { start: '22:00', end: '07:00', timezone: 'Asia/Kolkata' },
      },
      regulatoryChecks: {
        trai: { status: 'compliant', lastVerified: new Date(Date.now() - 86400000).toISOString() },
        gdpr: { status: 'compliant', lastVerified: new Date(Date.now() - 86400000).toISOString() },
        ccpa: { status: 'not_applicable', reason: 'No California users in active cohorts' },
      },
    };

    res.json({ success: true, data: report });
  } catch (err) {
    logger.error('Error generating compliance report', { error: err.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/monitoring/alerts/acknowledge - Acknowledge an alert
// ---------------------------------------------------------------------------

router.post(
  '/alerts/acknowledge',
  [
    body('alertId').isString().trim().notEmpty().withMessage('Alert ID is required'),
    body('acknowledgedBy').optional().isString().trim(),
    body('notes').optional().isString().trim(),
  ],
  (req, res) => {
    const validationError = handleValidation(req, res);
    if (validationError) return validationError;

    try {
      const { alertId, acknowledgedBy, notes } = req.body;
      const alert = alerts.get(alertId);

      if (!alert) {
        return res.status(404).json({ success: false, error: 'Alert not found' });
      }

      if (alert.acknowledged) {
        return res.status(409).json({
          success: false,
          error: 'Alert already acknowledged',
          acknowledgedBy: alert.acknowledgedBy,
          acknowledgedAt: alert.acknowledgedAt,
        });
      }

      alert.acknowledged = true;
      alert.acknowledgedBy = acknowledgedBy || 'admin';
      alert.acknowledgedAt = new Date().toISOString();
      alert.notes = notes || '';

      logger.info('Alert acknowledged', { alertId, acknowledgedBy: alert.acknowledgedBy });

      res.json({ success: true, data: alert });
    } catch (err) {
      logger.error('Error acknowledging alert', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

module.exports = router;
