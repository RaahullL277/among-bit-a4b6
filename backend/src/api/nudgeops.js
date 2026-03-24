/**
 * @module api/nudgeops
 * @description Express router for NudgeOps AI agent operations.
 */

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { auditLog } = require('../utils/audit');
const {
  DeliveryInfrastructure,
  CampaignRegistryService,
  FrequencyCapService,
  ConsentService,
} = require('../services/upstream-services');

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

// ---------------------------------------------------------------------------
// In-memory session and approval stores
// ---------------------------------------------------------------------------

const sessions = new Map();
const pendingApprovals = new Map();

// Seed pending approvals
function seedApprovals() {
  const items = [
    {
      id: 'apr_001',
      type: 'campaign_launch',
      description: 'Launch "Big Billion Day Push Blast" to 250,000 users',
      campaignId: 'cmp_001',
      requestedBy: 'nudgeops_agent',
      requestedAt: new Date(Date.now() - 3600000).toISOString(),
      autonomyTier: 2,
      status: 'pending',
      riskAssessment: {
        overallRisk: 'medium',
        factors: [
          { factor: 'cohort_size', risk: 'medium', detail: 'Large cohort (250K users)' },
          { factor: 'budget', risk: 'low', detail: 'Within allocated budget' },
          { factor: 'compliance', risk: 'low', detail: 'All consent and DND checks passed' },
        ],
      },
      context: {
        campaignName: 'Big Billion Day Push Blast',
        channel: 'push',
        cohortSize: 250000,
        estimatedBudget: 500000,
      },
    },
    {
      id: 'apr_002',
      type: 'experiment_promotion',
      description: 'Promote Variant A to 100% for experiment exp_flash_sale',
      experimentId: 'exp_flash_sale',
      requestedBy: 'nudgeops_agent',
      requestedAt: new Date(Date.now() - 7200000).toISOString(),
      autonomyTier: 2,
      status: 'pending',
      riskAssessment: {
        overallRisk: 'low',
        factors: [
          { factor: 'statistical_significance', risk: 'low', detail: 'p-value < 0.01, result is robust' },
          { factor: 'sample_size', risk: 'low', detail: '25,000 users in experiment' },
        ],
      },
      context: {
        experimentName: 'Flash Sale Creative Test',
        winner: 'variant_a',
        lift: '+18.3%',
        confidence: 99.2,
      },
    },
    {
      id: 'apr_003',
      type: 'route_switch',
      description: 'Switch SMS delivery from provider_a to provider_b due to latency spike',
      requestedBy: 'nudgeops_agent',
      requestedAt: new Date(Date.now() - 1800000).toISOString(),
      autonomyTier: 1,
      status: 'pending',
      riskAssessment: {
        overallRisk: 'low',
        factors: [
          { factor: 'provider_health', risk: 'low', detail: 'provider_b has 99.8% uptime this week' },
        ],
      },
      context: {
        currentProvider: 'provider_a',
        newProvider: 'provider_b',
        reason: 'provider_a P99 latency at 4.2s (threshold: 2s)',
      },
    },
  ];
  for (const a of items) pendingApprovals.set(a.id, a);
}

seedApprovals();

// ---------------------------------------------------------------------------
// Intent parser (simplified NLU mock)
// ---------------------------------------------------------------------------

function parseIntent(command) {
  const lower = command.toLowerCase();

  if (lower.includes('create') && lower.includes('campaign')) {
    return { intent: 'create_campaign', confidence: 0.92, entities: extractEntities(lower) };
  }
  if (lower.includes('launch') || lower.includes('start') && lower.includes('campaign')) {
    return { intent: 'launch_campaign', confidence: 0.89, entities: extractEntities(lower) };
  }
  if (lower.includes('pause') && lower.includes('campaign')) {
    return { intent: 'pause_campaign', confidence: 0.94, entities: extractEntities(lower) };
  }
  if (lower.includes('resume') && lower.includes('campaign')) {
    return { intent: 'resume_campaign', confidence: 0.93, entities: extractEntities(lower) };
  }
  if (lower.includes('status') || lower.includes('dashboard') || lower.includes('overview')) {
    return { intent: 'get_status', confidence: 0.91, entities: {} };
  }
  if (lower.includes('build') && lower.includes('cohort')) {
    return { intent: 'build_cohort', confidence: 0.90, entities: extractEntities(lower) };
  }
  if (lower.includes('experiment') || lower.includes('a/b test') || lower.includes('ab test')) {
    return { intent: 'manage_experiment', confidence: 0.87, entities: extractEntities(lower) };
  }
  if (lower.includes('analytics') || lower.includes('report') || lower.includes('performance')) {
    return { intent: 'get_analytics', confidence: 0.88, entities: extractEntities(lower) };
  }
  if (lower.includes('approve')) {
    return { intent: 'approve_action', confidence: 0.93, entities: extractEntities(lower) };
  }
  if (lower.includes('reject')) {
    return { intent: 'reject_action', confidence: 0.92, entities: extractEntities(lower) };
  }
  if (lower.includes('anomal') || lower.includes('alert') || lower.includes('issue')) {
    return { intent: 'check_anomalies', confidence: 0.86, entities: {} };
  }
  if (lower.includes('compliance') || lower.includes('consent') || lower.includes('dnd')) {
    return { intent: 'check_compliance', confidence: 0.88, entities: {} };
  }
  if (lower.includes('opportunity') || lower.includes('suggest') || lower.includes('recommend')) {
    return { intent: 'get_opportunities', confidence: 0.85, entities: {} };
  }

  return { intent: 'unknown', confidence: 0.3, entities: {} };
}

function extractEntities(text) {
  const entities = {};

  // Extract campaign ID
  const cmpMatch = text.match(/cmp_\w+/);
  if (cmpMatch) entities.campaignId = cmpMatch[0];

  // Extract channel
  const channels = ['push', 'sms', 'email', 'whatsapp', 'in_app'];
  for (const ch of channels) {
    if (text.includes(ch)) { entities.channel = ch; break; }
  }

  // Extract category
  const categories = ['electronics', 'fashion', 'grocery', 'home', 'beauty', 'sports', 'books'];
  for (const cat of categories) {
    if (text.includes(cat)) { entities.category = cat; break; }
  }

  // Extract numbers (potential cohort size or budget)
  const numMatch = text.match(/\b(\d{3,})\b/);
  if (numMatch) entities.numericValue = parseInt(numMatch[1]);

  return entities;
}

// ---------------------------------------------------------------------------
// POST /api/nudgeops/session/init - Initialize admin session
// ---------------------------------------------------------------------------

router.post(
  '/session/init',
  [
    body('adminId').optional().isString().trim(),
    body('preferences').optional().isObject(),
  ],
  async (req, res) => {
    try {
      const adminId = req.body.adminId || `admin_${uuidv4().slice(0, 6)}`;
      const sessionId = `sess_${uuidv4().slice(0, 12)}`;

      // Gather dashboard snapshot from upstream services
      const [deliveryStats, activeCampaigns] = await Promise.all([
        DeliveryInfrastructure.getDeliveryStats(),
        CampaignRegistryService.getActiveCampaigns(),
      ]);

      const session = {
        sessionId,
        adminId,
        startedAt: new Date().toISOString(),
        status: 'active',
      };

      sessions.set(sessionId, session);

      const snapshot = {
        session,
        dashboard: {
          greeting: `Welcome back. Here is your NudgeOps dashboard snapshot.`,
          timestamp: new Date().toISOString(),
          liveCampaigns: {
            total: activeCampaigns.total,
            campaigns: activeCampaigns.campaigns.slice(0, 5),
          },
          deliveryHealth: {
            provider: deliveryStats.provider,
            deliveryRate: deliveryStats.stats.deliveryRate,
            totalSentLast24h: deliveryStats.stats.totalSent,
            avgLatencyMs: deliveryStats.stats.avgLatencyMs,
          },
          pendingApprovals: {
            count: Array.from(pendingApprovals.values()).filter((a) => a.status === 'pending').length,
            items: Array.from(pendingApprovals.values())
              .filter((a) => a.status === 'pending')
              .map((a) => ({
                id: a.id,
                type: a.type,
                description: a.description,
                autonomyTier: a.autonomyTier,
                requestedAt: a.requestedAt,
              })),
          },
          activeAlerts: [
            {
              id: 'alert_003',
              severity: 'critical',
              message: 'Consent service returned stale data for 1,200 users',
              detectedAt: new Date(Date.now() - 600000).toISOString(),
            },
          ],
          quickStats: {
            campaignsLast7d: randomInt(8, 20),
            nudgesSentLast7d: randomInt(500000, 2000000),
            avgConversionRate: +(Math.random() * 3 + 2).toFixed(2),
            revenueLast7d: randomInt(10000000, 50000000),
          },
        },
        availableCommands: [
          'Create a new campaign',
          'Build a cohort for [segment/category]',
          'Show campaign status for [campaign_id]',
          'Pause/Resume campaign [campaign_id]',
          'Check anomalies',
          'Show analytics overview',
          'Show opportunities',
          'Approve/Reject [approval_id]',
          'Run A/B test for [campaign]',
          'Check compliance status',
        ],
      };

      auditLog.log('session.initialized', adminId, { sessionId }, 0);

      res.status(201).json({ success: true, data: snapshot });
    } catch (err) {
      logger.error('Error initializing session', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/nudgeops/command - Send command to NudgeOps agent
// ---------------------------------------------------------------------------

router.post(
  '/command',
  [
    body('sessionId').optional().isString().trim(),
    body('command').isString().trim().notEmpty().withMessage('Command text is required'),
    body('context').optional().isObject(),
  ],
  async (req, res) => {
    const validationError = handleValidation(req, res);
    if (validationError) return validationError;

    try {
      const { sessionId, command, context } = req.body;
      const commandId = `cmd_${uuidv4().slice(0, 8)}`;

      // Parse intent
      const parsed = parseIntent(command);

      logger.info('NudgeOps command received', { commandId, command, intent: parsed.intent });

      // Generate response based on intent
      let response;

      switch (parsed.intent) {
        case 'create_campaign':
          response = {
            action: 'create_campaign',
            message: 'I can help you create a new campaign. Let me prepare a campaign brief.',
            draft: {
              channel: parsed.entities.channel || 'push',
              category: parsed.entities.category || 'electronics',
              suggestedCohortSize: parsed.entities.numericValue || randomInt(10000, 200000),
              nextSteps: [
                'Define target audience and filters',
                'Select creative template',
                'Set schedule and budget',
                'Review and submit for approval',
              ],
            },
            requiresApproval: true,
            autonomyTier: 2,
          };
          break;

        case 'launch_campaign':
          response = {
            action: 'launch_campaign',
            message: parsed.entities.campaignId
              ? `Preparing to launch campaign ${parsed.entities.campaignId}. Running pre-flight checks.`
              : 'Which campaign would you like to launch? Please provide the campaign ID.',
            preFlightChecks: parsed.entities.campaignId ? {
              consentVerified: true,
              dndChecked: true,
              frequencyCapOk: true,
              cohortValidated: true,
              creativeApproved: true,
              budgetAvailable: true,
              allChecksPassed: true,
            } : null,
            requiresApproval: true,
            autonomyTier: 2,
          };
          break;

        case 'pause_campaign':
          response = {
            action: 'pause_campaign',
            message: parsed.entities.campaignId
              ? `Pausing campaign ${parsed.entities.campaignId}. This will stop all pending deliveries.`
              : 'Which campaign would you like to pause?',
            requiresApproval: false,
            autonomyTier: 1,
          };
          break;

        case 'resume_campaign':
          response = {
            action: 'resume_campaign',
            message: parsed.entities.campaignId
              ? `Resuming campaign ${parsed.entities.campaignId}. Delivery will restart from where it paused.`
              : 'Which campaign would you like to resume?',
            requiresApproval: false,
            autonomyTier: 1,
          };
          break;

        case 'get_status':
          response = {
            action: 'get_status',
            message: 'Here is the current system status.',
            status: {
              activeCampaigns: randomInt(3, 10),
              pendingApprovals: Array.from(pendingApprovals.values()).filter((a) => a.status === 'pending').length,
              activeAlerts: randomInt(0, 3),
              systemHealth: 'healthy',
              nudgesSentToday: randomInt(50000, 500000),
            },
            autonomyTier: 0,
          };
          break;

        case 'build_cohort':
          response = {
            action: 'build_cohort',
            message: 'I will build a cohort based on your criteria.',
            suggestedFilters: {
              segments: parsed.entities.category ? [parsed.entities.category] : ['high_value', 'deal_seeker'],
              channels: parsed.entities.channel ? [parsed.entities.channel] : ['push', 'email'],
              lastActiveDays: 30,
            },
            estimatedSize: randomInt(10000, 200000),
            nextSteps: ['Refine filters if needed', 'Validate cohort', 'Attach to campaign'],
            autonomyTier: 1,
          };
          break;

        case 'manage_experiment':
          response = {
            action: 'manage_experiment',
            message: 'I can help set up or manage an A/B test.',
            suggestedConfig: {
              variants: [
                { id: 'control', name: 'Current Creative', allocation: 50 },
                { id: 'variant_a', name: 'New Creative', allocation: 50 },
              ],
              targetSampleSize: randomInt(5000, 50000),
              minimumRunDays: 7,
              primaryMetric: 'conversion_rate',
            },
            requiresApproval: true,
            autonomyTier: 2,
          };
          break;

        case 'get_analytics':
          response = {
            action: 'get_analytics',
            message: 'Fetching analytics. Use /api/analytics/overview for full details.',
            quickSummary: {
              campaignsLast30d: randomInt(15, 40),
              avgROI: +(Math.random() * 200 + 150).toFixed(1),
              topChannel: pick(['push', 'whatsapp', 'email']),
              topCategory: pick(['electronics', 'fashion', 'grocery']),
              totalRevenue: randomInt(20000000, 80000000),
            },
            autonomyTier: 0,
          };
          break;

        case 'approve_action': {
          const approvalId = Object.keys(parsed.entities).length > 0
            ? parsed.entities.campaignId
            : null;
          const pending = Array.from(pendingApprovals.values()).filter((a) => a.status === 'pending');
          response = {
            action: 'approve_action',
            message: approvalId
              ? `Processing approval for ${approvalId}.`
              : `There are ${pending.length} pending approvals. Please specify which one to approve.`,
            pendingApprovals: pending.map((a) => ({ id: a.id, type: a.type, description: a.description })),
            autonomyTier: 2,
          };
          break;
        }

        case 'reject_action':
          response = {
            action: 'reject_action',
            message: 'Please specify the approval ID and reason for rejection.',
            autonomyTier: 2,
          };
          break;

        case 'check_anomalies':
          response = {
            action: 'check_anomalies',
            message: 'Scanning for anomalies across all active campaigns.',
            anomalySummary: {
              total: randomInt(1, 5),
              critical: randomInt(0, 1),
              high: randomInt(0, 2),
              medium: randomInt(0, 2),
              requiresAction: randomInt(0, 2),
            },
            autonomyTier: 0,
          };
          break;

        case 'check_compliance':
          response = {
            action: 'check_compliance',
            message: 'Running compliance health check.',
            complianceSummary: {
              overallStatus: 'compliant',
              consentRate: +(Math.random() * 0.5 + 99.5).toFixed(2),
              dndViolations: 0,
              capBreaches: randomInt(0, 10),
              lastFullAudit: new Date(Date.now() - 7 * 86400000).toISOString(),
            },
            autonomyTier: 0,
          };
          break;

        case 'get_opportunities':
          response = {
            action: 'get_opportunities',
            message: 'Here are the current proactive opportunities.',
            topOpportunities: [
              { type: 'price_drop', title: 'Samsung Galaxy S24 price drop', urgency: 'high', estimatedRevenue: 52400000 },
              { type: 'cart_abandonment', title: '8,920 carts abandoned in 6h', urgency: 'high', estimatedRevenue: 25700000 },
              { type: 'restock', title: 'boAt Airdopes back in stock', urgency: 'medium', estimatedRevenue: 4200000 },
            ],
            autonomyTier: 0,
          };
          break;

        default:
          response = {
            action: 'clarify',
            message: 'I did not fully understand that command. Here are some things I can help with:',
            suggestions: [
              'Create a new campaign for [category] via [channel]',
              'Show dashboard / status',
              'Build a cohort for [segment]',
              'Check anomalies or compliance',
              'Show analytics overview',
              'Approve or reject pending items',
            ],
            autonomyTier: 0,
          };
      }

      const result = {
        commandId,
        originalCommand: command,
        parsed: {
          intent: parsed.intent,
          confidence: parsed.confidence,
          entities: parsed.entities,
        },
        response,
        timestamp: new Date().toISOString(),
      };

      auditLog.log('nudgeops.command', sessionId || 'anonymous', {
        commandId,
        intent: parsed.intent,
        command: command.substring(0, 200),
      }, response.autonomyTier || 0);

      res.json({ success: true, data: result });
    } catch (err) {
      logger.error('Error processing NudgeOps command', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/nudgeops/pending-approvals - Get all pending approval requests
// ---------------------------------------------------------------------------

router.get(
  '/pending-approvals',
  [
    query('status').optional().isIn(['pending', 'approved', 'rejected']),
    query('type').optional().isString().trim(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ],
  (req, res) => {
    const validationError = handleValidation(req, res);
    if (validationError) return validationError;

    try {
      const { status, type, limit = 50, offset = 0 } = req.query;

      let results = Array.from(pendingApprovals.values());

      if (status) results = results.filter((a) => a.status === status);
      if (type) results = results.filter((a) => a.type === type);

      results.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));

      const total = results.length;
      const paged = results.slice(offset, offset + limit);

      res.json({
        success: true,
        data: {
          approvals: paged,
          pagination: { total, limit, offset, hasMore: offset + limit < total },
        },
      });
    } catch (err) {
      logger.error('Error fetching pending approvals', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/nudgeops/audit-log - Get audit trail
// ---------------------------------------------------------------------------

router.get(
  '/audit-log',
  [
    query('action').optional().isString().trim(),
    query('actor').optional().isString().trim(),
    query('tier').optional().isInt({ min: 0, max: 3 }).toInt(),
    query('outcome').optional().isIn(['SUCCESS', 'FAILURE', 'PARTIAL']),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('limit').optional().isInt({ min: 1, max: 500 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ],
  (req, res) => {
    const validationError = handleValidation(req, res);
    if (validationError) return validationError;

    try {
      const filters = {
        action: req.query.action,
        actor: req.query.actor,
        tier: req.query.tier,
        outcome: req.query.outcome,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        limit: req.query.limit ? parseInt(req.query.limit) : 100,
        offset: req.query.offset ? parseInt(req.query.offset) : 0,
      };

      const entries = auditLog.getLog(filters);

      res.json({
        success: true,
        data: {
          entries,
          pagination: {
            limit: filters.limit,
            offset: filters.offset,
            returned: entries.length,
          },
          totalStored: auditLog.size,
        },
      });
    } catch (err) {
      logger.error('Error fetching audit log', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/nudgeops/status - Agent status and health
// ---------------------------------------------------------------------------

router.get('/status', async (req, res) => {
  try {
    const activeSessions = Array.from(sessions.values()).filter((s) => s.status === 'active').length;

    // Check upstream service health
    let upstreamHealthy = true;
    try {
      await DeliveryInfrastructure.getDeliveryStats();
    } catch {
      upstreamHealthy = false;
    }

    const status = {
      agent: {
        name: 'NudgeOps AI Agent',
        version: '1.0.0',
        status: 'operational',
        uptime: `${randomInt(10, 90)}d ${randomInt(0, 23)}h ${randomInt(0, 59)}m`,
        startedAt: new Date(Date.now() - randomInt(10, 90) * 86400000).toISOString(),
      },
      capabilities: {
        campaignManagement: true,
        cohortBuilder: true,
        experimentEngine: true,
        realTimeMonitoring: true,
        complianceEngine: true,
        naturalLanguageInterface: true,
        proactiveOpportunities: true,
        learningLoop: true,
      },
      autonomyTiers: {
        tier0: { name: 'Observation', description: 'Read-only queries and status checks', active: true },
        tier1: { name: 'Suggestion', description: 'Recommendations with human confirmation', active: true },
        tier2: { name: 'Act-and-Report', description: 'Autonomous actions within guardrails, reported post-hoc', active: true },
        tier3: { name: 'Full Autonomy', description: 'Reserved for emergency interventions', active: false },
      },
      sessions: {
        active: activeSessions,
        total: sessions.size,
      },
      pendingApprovals: Array.from(pendingApprovals.values()).filter((a) => a.status === 'pending').length,
      upstreamServices: {
        overall: upstreamHealthy ? 'healthy' : 'degraded',
        services: {
          userProfileService: 'up',
          behaviourStreamService: 'up',
          recommendationService: 'up',
          pricingService: 'up',
          inventoryService: 'up',
          consentService: 'up',
          frequencyCapService: 'up',
          campaignRegistryService: 'up',
          experimentService: 'up',
          creativeAssetService: 'up',
          deliveryInfrastructure: upstreamHealthy ? 'up' : 'degraded',
          dndRegistryService: 'up',
        },
      },
      auditLog: {
        totalEntries: auditLog.size,
      },
      checkedAt: new Date().toISOString(),
    };

    res.json({ success: true, data: status });
  } catch (err) {
    logger.error('Error fetching agent status', { error: err.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;
