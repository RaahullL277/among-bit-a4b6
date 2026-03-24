/**
 * @module api/campaigns
 * @description Express router for campaign management endpoints.
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { auditLog } = require('../utils/audit');
const { CampaignRegistryService } = require('../services/upstream-services');

const router = express.Router();

// ---------------------------------------------------------------------------
// In-memory campaign store
// ---------------------------------------------------------------------------

const campaigns = new Map();

// Seed a few campaigns for demo purposes
function seedCampaigns() {
  const seed = [
    {
      id: 'cmp_001',
      name: 'Big Billion Day Push Blast',
      description: 'Push notification campaign for Big Billion Day sale',
      channel: 'push',
      category: 'electronics',
      status: 'active',
      brief: {
        objective: 'Drive traffic to electronics deals during BBD',
        targetAudience: 'high_value users who browsed electronics in last 30 days',
        budget: 500000,
        schedule: { start: '2026-03-25T00:00:00Z', end: '2026-03-30T23:59:59Z' },
      },
      cohortSize: 250000,
      createdBy: 'admin_01',
      createdAt: '2026-03-20T10:00:00Z',
      updatedAt: '2026-03-20T10:00:00Z',
      metrics: {
        sent: 245000,
        delivered: 238000,
        opened: 47600,
        clicked: 19040,
        converted: 4760,
        revenue: 14280000,
      },
    },
    {
      id: 'cmp_002',
      name: 'Fashion Weekend SMS',
      description: 'SMS campaign for weekend fashion sale',
      channel: 'sms',
      category: 'fashion',
      status: 'pending_approval',
      brief: {
        objective: 'Re-engage dormant fashion shoppers',
        targetAudience: 'dormant users with fashion affinity',
        budget: 200000,
        schedule: { start: '2026-03-28T09:00:00Z', end: '2026-03-29T21:00:00Z' },
      },
      cohortSize: 100000,
      createdBy: 'admin_02',
      createdAt: '2026-03-22T14:30:00Z',
      updatedAt: '2026-03-22T14:30:00Z',
      metrics: { sent: 0, delivered: 0, opened: 0, clicked: 0, converted: 0, revenue: 0 },
    },
    {
      id: 'cmp_003',
      name: 'Grocery Restock Reminder',
      description: 'Email reminder for grocery restock',
      channel: 'email',
      category: 'grocery',
      status: 'completed',
      brief: {
        objective: 'Remind users to restock groceries',
        targetAudience: 'users with recurring grocery purchases',
        budget: 80000,
        schedule: { start: '2026-03-15T08:00:00Z', end: '2026-03-18T20:00:00Z' },
      },
      cohortSize: 75000,
      createdBy: 'admin_01',
      createdAt: '2026-03-14T09:00:00Z',
      updatedAt: '2026-03-18T20:00:00Z',
      metrics: {
        sent: 75000,
        delivered: 72000,
        opened: 21600,
        clicked: 8640,
        converted: 3456,
        revenue: 5184000,
      },
    },
  ];

  for (const c of seed) {
    campaigns.set(c.id, c);
  }
}

seedCampaigns();

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }
  return null;
}

const VALID_STATUSES = ['draft', 'pending_approval', 'approved', 'active', 'paused', 'completed', 'rejected', 'archived'];
const VALID_CHANNELS = ['push', 'sms', 'email', 'whatsapp', 'in_app'];

// ---------------------------------------------------------------------------
// GET /api/campaigns - List campaigns with optional filtering
// ---------------------------------------------------------------------------

router.get(
  '/',
  [
    query('status').optional().isIn(VALID_STATUSES).withMessage(`Status must be one of: ${VALID_STATUSES.join(', ')}`),
    query('channel').optional().isIn(VALID_CHANNELS).withMessage(`Channel must be one of: ${VALID_CHANNELS.join(', ')}`),
    query('category').optional().isString().trim(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ],
  (req, res) => {
    const validationError = handleValidation(req, res);
    if (validationError) return validationError;

    try {
      const { status, channel, category, limit = 50, offset = 0 } = req.query;

      let result = Array.from(campaigns.values());

      if (status) result = result.filter((c) => c.status === status);
      if (channel) result = result.filter((c) => c.channel === channel);
      if (category) result = result.filter((c) => c.category === category);

      result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      const total = result.length;
      const paged = result.slice(offset, offset + limit);

      res.json({
        success: true,
        data: {
          campaigns: paged,
          pagination: { total, limit, offset, hasMore: offset + limit < total },
        },
      });
    } catch (err) {
      logger.error('Error listing campaigns', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/campaigns - Create a new campaign
// ---------------------------------------------------------------------------

router.post(
  '/',
  [
    body('name').isString().trim().notEmpty().withMessage('Campaign name is required'),
    body('description').optional().isString().trim(),
    body('channel').isIn(VALID_CHANNELS).withMessage(`Channel must be one of: ${VALID_CHANNELS.join(', ')}`),
    body('category').isString().trim().notEmpty().withMessage('Category is required'),
    body('brief').isObject().withMessage('Brief object is required'),
    body('brief.objective').isString().trim().notEmpty().withMessage('Brief objective is required'),
    body('brief.targetAudience').isString().trim().notEmpty().withMessage('Target audience is required'),
    body('brief.budget').isNumeric().withMessage('Budget must be a number'),
    body('brief.schedule').isObject().withMessage('Schedule object is required'),
    body('brief.schedule.start').isISO8601().withMessage('Schedule start must be a valid ISO date'),
    body('brief.schedule.end').isISO8601().withMessage('Schedule end must be a valid ISO date'),
    body('cohortSize').optional().isInt({ min: 1 }).withMessage('Cohort size must be a positive integer'),
    body('createdBy').optional().isString().trim(),
  ],
  async (req, res) => {
    const validationError = handleValidation(req, res);
    if (validationError) return validationError;

    try {
      const id = `cmp_${uuidv4().slice(0, 8)}`;
      const now = new Date().toISOString();

      const campaign = {
        id,
        name: req.body.name,
        description: req.body.description || '',
        channel: req.body.channel,
        category: req.body.category,
        status: 'draft',
        brief: req.body.brief,
        cohortSize: req.body.cohortSize || 0,
        createdBy: req.body.createdBy || 'system',
        createdAt: now,
        updatedAt: now,
        metrics: { sent: 0, delivered: 0, opened: 0, clicked: 0, converted: 0, revenue: 0 },
      };

      campaigns.set(id, campaign);

      // Register with upstream CampaignRegistryService
      await CampaignRegistryService.register({ id, name: campaign.name, channel: campaign.channel });

      auditLog.log('campaign.created', campaign.createdBy, { campaignId: id, name: campaign.name }, 1);

      logger.info('Campaign created', { campaignId: id });

      res.status(201).json({ success: true, data: campaign });
    } catch (err) {
      logger.error('Error creating campaign', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/campaigns/:id - Get campaign details
// ---------------------------------------------------------------------------

router.get(
  '/:id',
  [param('id').isString().trim().notEmpty()],
  (req, res) => {
    const validationError = handleValidation(req, res);
    if (validationError) return validationError;

    try {
      const campaign = campaigns.get(req.params.id);
      if (!campaign) {
        return res.status(404).json({ success: false, error: 'Campaign not found' });
      }
      res.json({ success: true, data: campaign });
    } catch (err) {
      logger.error('Error fetching campaign', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /api/campaigns/:id - Update campaign
// ---------------------------------------------------------------------------

router.put(
  '/:id',
  [
    param('id').isString().trim().notEmpty(),
    body('name').optional().isString().trim().notEmpty(),
    body('description').optional().isString().trim(),
    body('channel').optional().isIn(VALID_CHANNELS),
    body('category').optional().isString().trim(),
    body('brief').optional().isObject(),
    body('cohortSize').optional().isInt({ min: 1 }),
  ],
  (req, res) => {
    const validationError = handleValidation(req, res);
    if (validationError) return validationError;

    try {
      const campaign = campaigns.get(req.params.id);
      if (!campaign) {
        return res.status(404).json({ success: false, error: 'Campaign not found' });
      }

      if (['completed', 'archived'].includes(campaign.status)) {
        return res.status(409).json({
          success: false,
          error: `Cannot update campaign in '${campaign.status}' status`,
        });
      }

      const updatable = ['name', 'description', 'channel', 'category', 'brief', 'cohortSize'];
      for (const field of updatable) {
        if (req.body[field] !== undefined) {
          campaign[field] = req.body[field];
        }
      }
      campaign.updatedAt = new Date().toISOString();

      auditLog.log('campaign.updated', req.body.updatedBy || 'system', { campaignId: campaign.id }, 1);

      res.json({ success: true, data: campaign });
    } catch (err) {
      logger.error('Error updating campaign', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/campaigns/:id/approve - Approve campaign
// ---------------------------------------------------------------------------

router.post(
  '/:id/approve',
  [
    param('id').isString().trim().notEmpty(),
    body('approvedBy').optional().isString().trim(),
    body('comments').optional().isString().trim(),
  ],
  (req, res) => {
    const validationError = handleValidation(req, res);
    if (validationError) return validationError;

    try {
      const campaign = campaigns.get(req.params.id);
      if (!campaign) {
        return res.status(404).json({ success: false, error: 'Campaign not found' });
      }

      if (!['draft', 'pending_approval'].includes(campaign.status)) {
        return res.status(409).json({
          success: false,
          error: `Cannot approve campaign in '${campaign.status}' status`,
        });
      }

      campaign.status = 'approved';
      campaign.updatedAt = new Date().toISOString();
      campaign.approval = {
        approvedBy: req.body.approvedBy || 'admin',
        approvedAt: campaign.updatedAt,
        comments: req.body.comments || '',
      };

      auditLog.log('campaign.approved', campaign.approval.approvedBy, { campaignId: campaign.id }, 2);

      res.json({ success: true, data: campaign });
    } catch (err) {
      logger.error('Error approving campaign', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/campaigns/:id/reject - Reject campaign
// ---------------------------------------------------------------------------

router.post(
  '/:id/reject',
  [
    param('id').isString().trim().notEmpty(),
    body('rejectedBy').optional().isString().trim(),
    body('reason').isString().trim().notEmpty().withMessage('Rejection reason is required'),
  ],
  (req, res) => {
    const validationError = handleValidation(req, res);
    if (validationError) return validationError;

    try {
      const campaign = campaigns.get(req.params.id);
      if (!campaign) {
        return res.status(404).json({ success: false, error: 'Campaign not found' });
      }

      if (!['draft', 'pending_approval'].includes(campaign.status)) {
        return res.status(409).json({
          success: false,
          error: `Cannot reject campaign in '${campaign.status}' status`,
        });
      }

      campaign.status = 'rejected';
      campaign.updatedAt = new Date().toISOString();
      campaign.rejection = {
        rejectedBy: req.body.rejectedBy || 'admin',
        rejectedAt: campaign.updatedAt,
        reason: req.body.reason,
      };

      auditLog.log('campaign.rejected', campaign.rejection.rejectedBy, {
        campaignId: campaign.id,
        reason: req.body.reason,
      }, 2);

      res.json({ success: true, data: campaign });
    } catch (err) {
      logger.error('Error rejecting campaign', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/campaigns/:id/pause - Pause campaign
// ---------------------------------------------------------------------------

router.post(
  '/:id/pause',
  [
    param('id').isString().trim().notEmpty(),
    body('reason').optional().isString().trim(),
  ],
  (req, res) => {
    const validationError = handleValidation(req, res);
    if (validationError) return validationError;

    try {
      const campaign = campaigns.get(req.params.id);
      if (!campaign) {
        return res.status(404).json({ success: false, error: 'Campaign not found' });
      }

      if (campaign.status !== 'active') {
        return res.status(409).json({
          success: false,
          error: `Cannot pause campaign in '${campaign.status}' status. Campaign must be active.`,
        });
      }

      campaign.status = 'paused';
      campaign.updatedAt = new Date().toISOString();
      campaign.pauseInfo = {
        pausedAt: campaign.updatedAt,
        reason: req.body.reason || 'Manual pause',
      };

      auditLog.log('campaign.paused', 'system', { campaignId: campaign.id, reason: req.body.reason }, 1);

      res.json({ success: true, data: campaign });
    } catch (err) {
      logger.error('Error pausing campaign', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/campaigns/:id/resume - Resume campaign
// ---------------------------------------------------------------------------

router.post(
  '/:id/resume',
  [param('id').isString().trim().notEmpty()],
  (req, res) => {
    const validationError = handleValidation(req, res);
    if (validationError) return validationError;

    try {
      const campaign = campaigns.get(req.params.id);
      if (!campaign) {
        return res.status(404).json({ success: false, error: 'Campaign not found' });
      }

      if (campaign.status !== 'paused') {
        return res.status(409).json({
          success: false,
          error: `Cannot resume campaign in '${campaign.status}' status. Campaign must be paused.`,
        });
      }

      campaign.status = 'active';
      campaign.updatedAt = new Date().toISOString();
      delete campaign.pauseInfo;

      auditLog.log('campaign.resumed', 'system', { campaignId: campaign.id }, 1);

      res.json({ success: true, data: campaign });
    } catch (err) {
      logger.error('Error resuming campaign', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/campaigns/:id - Archive campaign
// ---------------------------------------------------------------------------

router.delete(
  '/:id',
  [param('id').isString().trim().notEmpty()],
  async (req, res) => {
    const validationError = handleValidation(req, res);
    if (validationError) return validationError;

    try {
      const campaign = campaigns.get(req.params.id);
      if (!campaign) {
        return res.status(404).json({ success: false, error: 'Campaign not found' });
      }

      campaign.status = 'archived';
      campaign.updatedAt = new Date().toISOString();
      campaign.archivedAt = campaign.updatedAt;

      // Deregister from upstream
      await CampaignRegistryService.deregister(campaign.id);

      auditLog.log('campaign.archived', 'system', { campaignId: campaign.id }, 1);

      res.json({ success: true, data: { campaignId: campaign.id, status: 'archived', archivedAt: campaign.archivedAt } });
    } catch (err) {
      logger.error('Error archiving campaign', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/campaigns/:id/metrics - Get campaign metrics
// ---------------------------------------------------------------------------

router.get(
  '/:id/metrics',
  [param('id').isString().trim().notEmpty()],
  (req, res) => {
    const validationError = handleValidation(req, res);
    if (validationError) return validationError;

    try {
      const campaign = campaigns.get(req.params.id);
      if (!campaign) {
        return res.status(404).json({ success: false, error: 'Campaign not found' });
      }

      const m = campaign.metrics;
      const derivedMetrics = {
        deliveryRate: m.sent > 0 ? +((m.delivered / m.sent) * 100).toFixed(2) : 0,
        openRate: m.delivered > 0 ? +((m.opened / m.delivered) * 100).toFixed(2) : 0,
        clickRate: m.opened > 0 ? +((m.clicked / m.opened) * 100).toFixed(2) : 0,
        conversionRate: m.clicked > 0 ? +((m.converted / m.clicked) * 100).toFixed(2) : 0,
        revenuePerUser: m.converted > 0 ? +(m.revenue / m.converted).toFixed(2) : 0,
        costPerConversion: campaign.brief.budget && m.converted > 0
          ? +(campaign.brief.budget / m.converted).toFixed(2)
          : 0,
        roi: campaign.brief.budget && m.revenue > 0
          ? +(((m.revenue - campaign.brief.budget) / campaign.brief.budget) * 100).toFixed(2)
          : 0,
      };

      res.json({
        success: true,
        data: {
          campaignId: campaign.id,
          campaignName: campaign.name,
          status: campaign.status,
          rawMetrics: m,
          derivedMetrics,
          computedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      logger.error('Error fetching campaign metrics', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

module.exports = router;
