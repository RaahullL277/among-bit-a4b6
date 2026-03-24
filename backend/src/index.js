/**
 * @module index
 * @description NudgeOps backend engine — Express server entry point.
 *              Mounts all API routes for autonomy, compliance, decision intelligence,
 *              campaign management, and audit.
 */

const express = require('express');
const cors = require('cors');
const { body, param, query, validationResult } = require('express-validator');

const logger = require('./utils/logger');
const { auditLog } = require('./utils/audit');
const { AutonomyTier, TIER_LABELS, TIER_0_ACTIONS, TIER_1_ACTIONS, TIER_2_ACTIONS, TIER_3_ACTIONS, classifyAction } = require('./core/autonomy');
const { PreSendInterceptor, RegulationMapper, detectJurisdiction, REGULATIONS } = require('./core/compliance');
const {
  FATIGUE_THRESHOLDS,
  calculateFatigueScore,
  getFatigueCategory,
  calculateChannelScore,
  rankChannels,
  calculateCampaignPriority,
  resolveConflicts,
  detectOpportunities,
} = require('./core/decision-intelligence');
const { CampaignState, CampaignManager } = require('./core/campaign-manager');

/* ------------------------------------------------------------------ */
/*  Initialise singletons                                            */
/* ------------------------------------------------------------------ */

const app = express();
const interceptor = new PreSendInterceptor();
const campaignManager = new CampaignManager();

// Log campaign state changes to audit trail
campaignManager.on('campaign:stateChange', ({ campaign, from, to }) => {
  auditLog.log('CAMPAIGN_STATE_CHANGE', campaign.createdBy, { campaignId: campaign.id, from, to }, 0);
});

/* ------------------------------------------------------------------ */
/*  Middleware                                                        */
/* ------------------------------------------------------------------ */

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Request logging
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`, { query: req.query });
  next();
});

// Validation error handler helper
function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }
  return null;
}

/* ================================================================== */
/*  Health                                                            */
/* ================================================================== */

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'nudgeops-backend', timestamp: new Date().toISOString() });
});

/* ================================================================== */
/*  Autonomy Routes                                                   */
/* ================================================================== */

/**
 * POST /api/autonomy/classify
 * Classify an action into an autonomy tier.
 */
app.post(
  '/api/autonomy/classify',
  body('actionType').isString().notEmpty(),
  (req, res) => {
    const err = handleValidation(req, res);
    if (err) return;

    const { actionType, context } = req.body;
    const result = classifyAction(actionType, context || {});

    auditLog.log('ACTION_CLASSIFIED', 'system', { actionType, result }, result.tier);
    res.json(result);
  }
);

/**
 * GET /api/autonomy/tiers
 * List all actions grouped by tier.
 */
app.get('/api/autonomy/tiers', (_req, res) => {
  res.json({
    [AutonomyTier.FULL_AUTONOMY]: { label: TIER_LABELS[0], actions: TIER_0_ACTIONS },
    [AutonomyTier.AUTONOMOUS_WITH_NOTIFICATION]: { label: TIER_LABELS[1], actions: TIER_1_ACTIONS },
    [AutonomyTier.HUMAN_APPROVAL_REQUIRED]: { label: TIER_LABELS[2], actions: TIER_2_ACTIONS },
    [AutonomyTier.FORBIDDEN]: { label: TIER_LABELS[3], actions: TIER_3_ACTIONS },
  });
});

/* ================================================================== */
/*  Compliance Routes                                                 */
/* ================================================================== */

/**
 * POST /api/compliance/check
 * Run pre-send compliance gates on a message payload.
 */
app.post(
  '/api/compliance/check',
  body('channel').isString().notEmpty(),
  body('body').isString(),
  (req, res) => {
    const err = handleValidation(req, res);
    if (err) return;

    const result = interceptor.runAllGates(req.body);

    auditLog.log(
      'COMPLIANCE_CHECK',
      'system',
      {
        channel: req.body.channel,
        passed: result.passed,
        failedGate: result.failedGate ? result.failedGate.gate : null,
      },
      0
    );

    res.json(result);
  }
);

/**
 * POST /api/compliance/jurisdiction
 * Detect jurisdiction and applicable regulations for a user profile.
 */
app.post('/api/compliance/jurisdiction', (req, res) => {
  const result = detectJurisdiction(req.body);
  res.json(result);
});

/**
 * GET /api/compliance/regulations
 * List all known regulations.
 */
app.get('/api/compliance/regulations', (_req, res) => {
  res.json(REGULATIONS);
});

/* ================================================================== */
/*  Decision Intelligence Routes                                      */
/* ================================================================== */

/**
 * POST /api/intelligence/fatigue
 * Calculate fatigue score and category for a user.
 */
app.post('/api/intelligence/fatigue', (req, res) => {
  const score = calculateFatigueScore(req.body);
  const category = getFatigueCategory(score);
  res.json(category);
});

/**
 * GET /api/intelligence/fatigue/thresholds
 * Return fatigue threshold definitions.
 */
app.get('/api/intelligence/fatigue/thresholds', (_req, res) => {
  res.json(FATIGUE_THRESHOLDS);
});

/**
 * POST /api/intelligence/channel-score
 * Calculate channel affinity score.
 */
app.post(
  '/api/intelligence/channel-score',
  body('userId').isString().notEmpty(),
  body('channel').isString().notEmpty(),
  (req, res) => {
    const err = handleValidation(req, res);
    if (err) return;

    const { userId, channel, historicalData } = req.body;
    const result = calculateChannelScore(userId, channel, historicalData || {});
    res.json(result);
  }
);

/**
 * POST /api/intelligence/rank-channels
 * Rank channels by affinity for a user.
 */
app.post(
  '/api/intelligence/rank-channels',
  body('userId').isString().notEmpty(),
  (req, res) => {
    const err = handleValidation(req, res);
    if (err) return;

    const { userId, historicalData } = req.body;
    const result = rankChannels(userId, historicalData || {});
    res.json(result);
  }
);

/**
 * POST /api/intelligence/campaign-priority
 * Calculate priority for a campaign + user pair.
 */
app.post('/api/intelligence/campaign-priority', (req, res) => {
  const { campaign, user } = req.body;
  const result = calculateCampaignPriority(campaign || {}, user || {});
  res.json(result);
});

/**
 * POST /api/intelligence/resolve-conflicts
 * Resolve competition between multiple campaigns for a user.
 */
app.post(
  '/api/intelligence/resolve-conflicts',
  body('campaigns').isArray({ min: 1 }),
  body('userId').isString().notEmpty(),
  (req, res) => {
    const err = handleValidation(req, res);
    if (err) return;

    const { campaigns, userId, userProfile } = req.body;
    const result = resolveConflicts(campaigns, userId, userProfile || {});
    res.json(result);
  }
);

/**
 * POST /api/intelligence/opportunities
 * Detect proactive nudge opportunities.
 */
app.post('/api/intelligence/opportunities', (req, res) => {
  const { marketData, campaignData } = req.body;
  const result = detectOpportunities(marketData || {}, campaignData || {});
  res.json(result);
});

/* ================================================================== */
/*  Campaign Management Routes                                        */
/* ================================================================== */

/**
 * POST /api/campaigns
 * Create a new campaign.
 */
app.post(
  '/api/campaigns',
  body('name').isString().notEmpty(),
  (req, res) => {
    const err = handleValidation(req, res);
    if (err) return;

    try {
      const campaign = campaignManager.createCampaign(req.body);
      auditLog.log('CAMPAIGN_CREATED', req.body.createdBy || 'system', { campaignId: campaign.id }, 2);
      res.status(201).json(campaign);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);

/**
 * GET /api/campaigns
 * List campaigns, optionally filtered by state.
 */
app.get('/api/campaigns', (req, res) => {
  const campaigns = campaignManager.listCampaigns(req.query.state || undefined);
  res.json(campaigns);
});

/**
 * GET /api/campaigns/:id
 * Get a single campaign.
 */
app.get('/api/campaigns/:id', (req, res) => {
  const campaign = campaignManager.getCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  res.json(campaign);
});

/**
 * PUT /api/campaigns/:id
 * Update a campaign (only in DRAFT or PENDING_APPROVAL).
 */
app.put('/api/campaigns/:id', (req, res) => {
  try {
    const campaign = campaignManager.updateCampaign(req.params.id, req.body);
    res.json(campaign);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * POST /api/campaigns/:id/submit
 * Submit for approval.
 */
app.post('/api/campaigns/:id/submit', (req, res) => {
  try {
    const campaign = campaignManager.submitForApproval(req.params.id);
    auditLog.log('CAMPAIGN_SUBMITTED', 'system', { campaignId: req.params.id }, 2);
    res.json(campaign);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * POST /api/campaigns/:id/approve
 * Approve a pending campaign.
 */
app.post('/api/campaigns/:id/approve', (req, res) => {
  try {
    const approver = req.body.approver || 'system';
    const campaign = campaignManager.approveCampaign(req.params.id, approver);
    auditLog.log('CAMPAIGN_APPROVED', approver, { campaignId: req.params.id }, 2);
    res.json(campaign);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * POST /api/campaigns/:id/schedule
 * Schedule an approved campaign.
 */
app.post('/api/campaigns/:id/schedule', (req, res) => {
  try {
    const campaign = campaignManager.scheduleCampaign(req.params.id, req.body.scheduledAt);
    res.json(campaign);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * POST /api/campaigns/:id/launch
 * Launch a campaign.
 */
app.post('/api/campaigns/:id/launch', (req, res) => {
  try {
    const campaign = campaignManager.launchCampaign(req.params.id);
    auditLog.log('CAMPAIGN_LAUNCHED', 'system', { campaignId: req.params.id }, 1);
    res.json(campaign);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * POST /api/campaigns/:id/pause
 * Pause a campaign.
 */
app.post('/api/campaigns/:id/pause', (req, res) => {
  try {
    const campaign = campaignManager.pauseCampaign(req.params.id, req.body.reason);
    auditLog.log('CAMPAIGN_PAUSED', 'system', { campaignId: req.params.id, reason: req.body.reason }, 1);
    res.json(campaign);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * POST /api/campaigns/:id/resume
 * Resume a paused campaign.
 */
app.post('/api/campaigns/:id/resume', (req, res) => {
  try {
    const campaign = campaignManager.resumeCampaign(req.params.id);
    auditLog.log('CAMPAIGN_RESUMED', 'system', { campaignId: req.params.id }, 1);
    res.json(campaign);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * POST /api/campaigns/:id/kill
 * Kill a campaign.
 */
app.post('/api/campaigns/:id/kill', (req, res) => {
  try {
    const campaign = campaignManager.killCampaign(req.params.id, req.body.reason);
    auditLog.log('CAMPAIGN_KILLED', 'system', { campaignId: req.params.id, reason: req.body.reason }, 1);
    res.json(campaign);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * POST /api/campaigns/:id/archive
 * Archive a campaign.
 */
app.post('/api/campaigns/:id/archive', (req, res) => {
  try {
    const campaign = campaignManager.archiveCampaign(req.params.id);
    auditLog.log('CAMPAIGN_ARCHIVED', 'system', { campaignId: req.params.id }, 0);
    res.json(campaign);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * GET /api/campaigns/:id/brief
 * Generate a formatted campaign brief.
 */
app.get('/api/campaigns/:id/brief', (req, res) => {
  try {
    const brief = campaignManager.generateCampaignBrief(req.params.id);
    res.type('text/plain').send(brief);
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

/* ================================================================== */
/*  Audit Routes                                                      */
/* ================================================================== */

/**
 * GET /api/audit
 * Query audit log with optional filters.
 */
app.get('/api/audit', (req, res) => {
  const filters = {
    action: req.query.action,
    actor: req.query.actor,
    tier: req.query.tier !== undefined ? parseInt(req.query.tier, 10) : undefined,
    outcome: req.query.outcome,
    startDate: req.query.startDate,
    endDate: req.query.endDate,
    limit: req.query.limit ? parseInt(req.query.limit, 10) : 100,
    offset: req.query.offset ? parseInt(req.query.offset, 10) : 0,
  };

  const entries = auditLog.getLog(filters);
  res.json({ total: auditLog.size, returned: entries.length, entries });
});

/**
 * POST /api/audit/report
 * Generate an audit report for a time range.
 */
app.post(
  '/api/audit/report',
  body('startDate').isISO8601(),
  body('endDate').isISO8601(),
  (req, res) => {
    const err = handleValidation(req, res);
    if (err) return;

    const report = auditLog.generateReport(req.body);
    res.json(report);
  }
);

/* ================================================================== */
/*  Error handling                                                    */
/* ================================================================== */

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, _req, res, _next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

/* ================================================================== */
/*  Start server                                                      */
/* ================================================================== */

const PORT = process.env.PORT || 8000;

const server = app.listen(PORT, () => {
  logger.info(`NudgeOps backend listening on port ${PORT}`);
});

module.exports = { app, server, campaignManager, interceptor, auditLog };
