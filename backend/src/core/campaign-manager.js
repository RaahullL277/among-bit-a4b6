/**
 * @module campaign-manager
 * @description Campaign lifecycle management with state machine,
 *              in-memory store, event emitter, and brief generation.
 */

const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');
const logger = require('../utils/logger');

/* ------------------------------------------------------------------ */
/*  Campaign States                                                   */
/* ------------------------------------------------------------------ */

/** @enum {string} */
const CampaignState = Object.freeze({
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  SCHEDULED: 'SCHEDULED',
  LIVE: 'LIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  KILLED: 'KILLED',
  ARCHIVED: 'ARCHIVED',
});

/**
 * Allowed state transitions.
 * Key = current state, value = set of valid next states.
 * @type {Object<string, Set<string>>}
 */
const STATE_TRANSITIONS = Object.freeze({
  [CampaignState.DRAFT]: new Set([
    CampaignState.PENDING_APPROVAL,
    CampaignState.KILLED,
  ]),
  [CampaignState.PENDING_APPROVAL]: new Set([
    CampaignState.APPROVED,
    CampaignState.DRAFT,
    CampaignState.KILLED,
  ]),
  [CampaignState.APPROVED]: new Set([
    CampaignState.SCHEDULED,
    CampaignState.LIVE,
    CampaignState.KILLED,
  ]),
  [CampaignState.SCHEDULED]: new Set([
    CampaignState.LIVE,
    CampaignState.PAUSED,
    CampaignState.KILLED,
  ]),
  [CampaignState.LIVE]: new Set([
    CampaignState.PAUSED,
    CampaignState.COMPLETED,
    CampaignState.KILLED,
  ]),
  [CampaignState.PAUSED]: new Set([
    CampaignState.LIVE,
    CampaignState.KILLED,
    CampaignState.ARCHIVED,
  ]),
  [CampaignState.COMPLETED]: new Set([
    CampaignState.ARCHIVED,
  ]),
  [CampaignState.KILLED]: new Set([
    CampaignState.ARCHIVED,
  ]),
  [CampaignState.ARCHIVED]: new Set([]),
});

/* ------------------------------------------------------------------ */
/*  CampaignManager                                                   */
/* ------------------------------------------------------------------ */

/**
 * @class CampaignManager
 * @extends EventEmitter
 * @description Manages campaign CRUD and lifecycle state transitions.
 *
 * Events emitted:
 *   - 'campaign:created'       { campaign }
 *   - 'campaign:updated'       { campaign, changes }
 *   - 'campaign:stateChange'   { campaign, from, to }
 *   - 'campaign:paused'        { campaign, reason }
 *   - 'campaign:resumed'       { campaign }
 *   - 'campaign:killed'        { campaign, reason }
 *   - 'campaign:archived'      { campaign }
 */
class CampaignManager extends EventEmitter {
  constructor() {
    super();
    /** @type {Map<string, object>} */
    this._store = new Map();
  }

  /* ---- Helpers --------------------------------------------------- */

  /**
   * Validate that a state transition is allowed.
   * @param {string} from
   * @param {string} to
   * @returns {boolean}
   */
  _isValidTransition(from, to) {
    const allowed = STATE_TRANSITIONS[from];
    return allowed ? allowed.has(to) : false;
  }

  /**
   * Transition a campaign's state with validation.
   * @param {string} campaignId
   * @param {string} newState
   * @param {string} [reason]
   * @returns {object} Updated campaign.
   * @throws {Error} If transition is invalid.
   */
  _transition(campaignId, newState, reason) {
    const campaign = this._store.get(campaignId);
    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    const oldState = campaign.state;
    if (!this._isValidTransition(oldState, newState)) {
      throw new Error(
        `Invalid state transition: ${oldState} → ${newState}. Allowed from ${oldState}: [${Array.from(STATE_TRANSITIONS[oldState] || []).join(', ')}]`
      );
    }

    campaign.state = newState;
    campaign.updatedAt = new Date().toISOString();
    campaign.stateHistory.push({
      from: oldState,
      to: newState,
      reason: reason || null,
      timestamp: campaign.updatedAt,
    });

    this._store.set(campaignId, campaign);

    logger.info('Campaign state transition', {
      campaignId,
      from: oldState,
      to: newState,
      reason,
    });

    this.emit('campaign:stateChange', { campaign, from: oldState, to: newState });

    return campaign;
  }

  /* ---- Public API ------------------------------------------------ */

  /**
   * Create a new campaign in DRAFT state.
   *
   * @param {object} params
   * @param {string} params.name - Campaign name.
   * @param {string} [params.description] - Description / objective.
   * @param {string} [params.channel] - Primary channel.
   * @param {string} [params.category] - Product category.
   * @param {object} [params.targeting] - Targeting criteria.
   * @param {object} [params.content] - Message content / template.
   * @param {string} [params.scheduledAt] - ISO date for scheduled send.
   * @param {number} [params.budget] - Budget in INR.
   * @param {number} [params.business_value] - Business value score 0-100.
   * @param {number} [params.time_sensitivity] - Time sensitivity 0-100.
   * @param {string} [params.createdBy] - Actor who created the campaign.
   * @returns {object} The created campaign.
   */
  createCampaign(params) {
    const id = uuidv4();
    const now = new Date().toISOString();

    const campaign = {
      id,
      name: params.name,
      description: params.description || '',
      channel: params.channel || null,
      category: params.category || null,
      targeting: params.targeting || {},
      content: params.content || {},
      scheduledAt: params.scheduledAt || null,
      budget: params.budget || 0,
      business_value: params.business_value || 0,
      time_sensitivity: params.time_sensitivity || 0,
      approval_level: 0,
      state: CampaignState.DRAFT,
      stateHistory: [
        { from: null, to: CampaignState.DRAFT, reason: 'Campaign created', timestamp: now },
      ],
      metrics: {
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        converted: 0,
        unsubscribed: 0,
        complained: 0,
        failed: 0,
      },
      createdBy: params.createdBy || 'system',
      createdAt: now,
      updatedAt: now,
    };

    this._store.set(id, campaign);

    logger.info('Campaign created', { campaignId: id, name: campaign.name });
    this.emit('campaign:created', { campaign });

    return campaign;
  }

  /**
   * Update a campaign's editable fields. Only allowed in DRAFT or PENDING_APPROVAL states.
   *
   * @param {string} campaignId
   * @param {object} updates - Partial update to campaign fields.
   * @returns {object} Updated campaign.
   * @throws {Error} If campaign is not in an editable state.
   */
  updateCampaign(campaignId, updates) {
    const campaign = this._store.get(campaignId);
    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    const editableStates = new Set([CampaignState.DRAFT, CampaignState.PENDING_APPROVAL]);
    if (!editableStates.has(campaign.state)) {
      throw new Error(`Campaign cannot be edited in state: ${campaign.state}`);
    }

    const immutableFields = new Set(['id', 'state', 'stateHistory', 'createdAt', 'createdBy', 'metrics']);
    const changes = {};

    for (const [key, value] of Object.entries(updates)) {
      if (immutableFields.has(key)) continue;
      if (campaign[key] !== value) {
        changes[key] = { from: campaign[key], to: value };
        campaign[key] = value;
      }
    }

    campaign.updatedAt = new Date().toISOString();
    this._store.set(campaignId, campaign);

    logger.info('Campaign updated', { campaignId, changes });
    this.emit('campaign:updated', { campaign, changes });

    return campaign;
  }

  /**
   * Pause a live or scheduled campaign.
   *
   * @param {string} campaignId
   * @param {string} [reason='Manual pause']
   * @returns {object} Updated campaign.
   */
  pauseCampaign(campaignId, reason = 'Manual pause') {
    const campaign = this._transition(campaignId, CampaignState.PAUSED, reason);
    this.emit('campaign:paused', { campaign, reason });
    return campaign;
  }

  /**
   * Resume a paused campaign back to LIVE.
   *
   * @param {string} campaignId
   * @returns {object} Updated campaign.
   */
  resumeCampaign(campaignId) {
    const campaign = this._transition(campaignId, CampaignState.LIVE, 'Resumed');
    this.emit('campaign:resumed', { campaign });
    return campaign;
  }

  /**
   * Kill a campaign. Allowed from DRAFT, PENDING_APPROVAL, APPROVED, SCHEDULED, LIVE.
   *
   * @param {string} campaignId
   * @param {string} [reason='Manual kill']
   * @returns {object} Updated campaign.
   */
  killCampaign(campaignId, reason = 'Manual kill') {
    const campaign = this._transition(campaignId, CampaignState.KILLED, reason);
    this.emit('campaign:killed', { campaign, reason });
    return campaign;
  }

  /**
   * Archive a completed, killed, or paused campaign.
   *
   * @param {string} campaignId
   * @returns {object} Updated campaign.
   */
  archiveCampaign(campaignId) {
    const campaign = this._transition(campaignId, CampaignState.ARCHIVED, 'Archived');
    this.emit('campaign:archived', { campaign });
    return campaign;
  }

  /**
   * Get a campaign by ID.
   * @param {string} campaignId
   * @returns {object|undefined}
   */
  getCampaign(campaignId) {
    return this._store.get(campaignId);
  }

  /**
   * List all campaigns, optionally filtered by state.
   * @param {string} [state]
   * @returns {object[]}
   */
  listCampaigns(state) {
    let campaigns = Array.from(this._store.values());
    if (state) {
      campaigns = campaigns.filter((c) => c.state === state);
    }
    return campaigns.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  /**
   * Submit a DRAFT campaign for approval.
   * @param {string} campaignId
   * @returns {object}
   */
  submitForApproval(campaignId) {
    return this._transition(campaignId, CampaignState.PENDING_APPROVAL, 'Submitted for approval');
  }

  /**
   * Approve a pending campaign.
   * @param {string} campaignId
   * @param {string} [approver='system']
   * @returns {object}
   */
  approveCampaign(campaignId, approver = 'system') {
    const campaign = this._transition(campaignId, CampaignState.APPROVED, `Approved by ${approver}`);
    campaign.approval_level = Math.max(campaign.approval_level, 1);
    this._store.set(campaignId, campaign);
    return campaign;
  }

  /**
   * Schedule an approved campaign.
   * @param {string} campaignId
   * @param {string} [scheduledAt]
   * @returns {object}
   */
  scheduleCampaign(campaignId, scheduledAt) {
    const campaign = this._transition(campaignId, CampaignState.SCHEDULED, 'Scheduled');
    if (scheduledAt) {
      campaign.scheduledAt = scheduledAt;
      this._store.set(campaignId, campaign);
    }
    return campaign;
  }

  /**
   * Launch a campaign (transition to LIVE).
   * @param {string} campaignId
   * @returns {object}
   */
  launchCampaign(campaignId) {
    return this._transition(campaignId, CampaignState.LIVE, 'Launched');
  }

  /**
   * Mark a campaign as completed.
   * @param {string} campaignId
   * @returns {object}
   */
  completeCampaign(campaignId) {
    return this._transition(campaignId, CampaignState.COMPLETED, 'Campaign completed');
  }

  /* ---- Brief Generation ------------------------------------------ */

  /**
   * Generate a formatted campaign brief (per §8 of the NudgeOps spec).
   *
   * @param {object} campaign - The campaign object (or campaign ID string).
   * @returns {string} Formatted multi-line brief.
   */
  generateCampaignBrief(campaign) {
    if (typeof campaign === 'string') {
      campaign = this._store.get(campaign);
      if (!campaign) {
        throw new Error('Campaign not found');
      }
    }

    const m = campaign.metrics || {};
    const deliveryRate = m.sent > 0 ? ((m.delivered / m.sent) * 100).toFixed(1) : 'N/A';
    const openRate = m.delivered > 0 ? ((m.opened / m.delivered) * 100).toFixed(1) : 'N/A';
    const ctr = m.opened > 0 ? ((m.clicked / m.opened) * 100).toFixed(1) : 'N/A';
    const conversionRate = m.clicked > 0 ? ((m.converted / m.clicked) * 100).toFixed(1) : 'N/A';

    const targeting = campaign.targeting || {};
    const audienceDesc = targeting.description || targeting.segment || 'Not specified';
    const audienceSize = targeting.estimatedSize ? targeting.estimatedSize.toLocaleString() : 'N/A';

    const lines = [
      '═══════════════════════════════════════════════════════════',
      `  CAMPAIGN BRIEF: ${campaign.name}`,
      '═══════════════════════════════════════════════════════════',
      '',
      `  Campaign ID    : ${campaign.id}`,
      `  State          : ${campaign.state}`,
      `  Channel        : ${campaign.channel || 'Not specified'}`,
      `  Category       : ${campaign.category || 'Not specified'}`,
      `  Created By     : ${campaign.createdBy}`,
      `  Created At     : ${campaign.createdAt}`,
      `  Last Updated   : ${campaign.updatedAt}`,
      '',
      '  OBJECTIVE',
      `  ${campaign.description || 'No description provided.'}`,
      '',
      '  TARGETING',
      `  Audience       : ${audienceDesc}`,
      `  Estimated Size : ${audienceSize}`,
      '',
      '  BUDGET & PRIORITY',
      `  Budget         : ₹${(campaign.budget || 0).toLocaleString()}`,
      `  Business Value : ${campaign.business_value}/100`,
      `  Time Sensitive : ${campaign.time_sensitivity}/100`,
      `  Approval Level : ${campaign.approval_level}`,
      '',
      '  CONTENT',
      `  Template       : ${(campaign.content && campaign.content.templateId) || 'N/A'}`,
      `  Subject        : ${(campaign.content && campaign.content.subject) || 'N/A'}`,
      `  Body Preview   : ${(campaign.content && campaign.content.body) ? campaign.content.body.substring(0, 120) + (campaign.content.body.length > 120 ? '…' : '') : 'N/A'}`,
      '',
      '  SCHEDULE',
      `  Scheduled At   : ${campaign.scheduledAt || 'Not scheduled'}`,
      '',
      '  PERFORMANCE METRICS',
      `  Sent           : ${m.sent.toLocaleString()}`,
      `  Delivered      : ${m.delivered.toLocaleString()} (${deliveryRate}%)`,
      `  Opened         : ${m.opened.toLocaleString()} (${openRate}%)`,
      `  Clicked        : ${m.clicked.toLocaleString()} (CTR ${ctr}%)`,
      `  Converted      : ${m.converted.toLocaleString()} (${conversionRate}%)`,
      `  Unsubscribed   : ${m.unsubscribed.toLocaleString()}`,
      `  Complained     : ${m.complained.toLocaleString()}`,
      `  Failed         : ${m.failed.toLocaleString()}`,
      '',
      '  STATE HISTORY',
      ...campaign.stateHistory.map(
        (h) => `    ${h.timestamp}  ${h.from || '—'} → ${h.to}  ${h.reason ? `(${h.reason})` : ''}`
      ),
      '',
      '═══════════════════════════════════════════════════════════',
    ];

    return lines.join('\n');
  }
}

module.exports = {
  CampaignState,
  STATE_TRANSITIONS,
  CampaignManager,
};
