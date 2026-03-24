'use strict';

const { EventEmitter } = require('events');

const STATES = {
  PARSE_INTENT: 'PARSE_INTENT',
  BUILD_COHORT: 'BUILD_COHORT',
  FILTER_CONSENT: 'FILTER_CONSENT',
  FILTER_FREQUENCY: 'FILTER_FREQUENCY',
  DND_SCRUB: 'DND_SCRUB',
  CANNIBALIZATION_CHECK: 'CANNIBALIZATION_CHECK',
  ESTIMATE_REACH: 'ESTIMATE_REACH',
  GENERATE_COPY: 'GENERATE_COPY',
  BENCHMARK_QUERY: 'BENCHMARK_QUERY',
  DETERMINE_APPROVAL_CHAIN: 'DETERMINE_APPROVAL_CHAIN',
  COMPILE_BRIEF: 'COMPILE_BRIEF',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  CONFIGURE_AB: 'CONFIGURE_AB',
  SET_STO: 'SET_STO',
  BIND_TRIGGERS: 'BIND_TRIGGERS',
  REGISTER_EXPERIMENT: 'REGISTER_EXPERIMENT',
  PUSH_DELIVERY: 'PUSH_DELIVERY',
  MONITORING: 'MONITORING',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
};

/**
 * Simulates an async service call with configurable delay and mock result.
 */
function mockServiceCall(name, result, delayMs = 50) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(result), delayMs);
  });
}

class CampaignCreationWorkflow extends EventEmitter {
  constructor(options = {}) {
    super();
    this.state = null;
    this.campaignData = {};
    this.approvalPromise = null;
    this.approvalResolve = null;
    this.history = [];
    this.options = {
      mockDelay: options.mockDelay || 50,
      ...options,
    };
  }

  _log(message) {
    const entry = { timestamp: new Date().toISOString(), state: this.state, message };
    this.history.push(entry);
    this.emit('log', entry);
  }

  _transition(newState) {
    const prev = this.state;
    this.state = newState;
    this._log(`Transition: ${prev || 'INIT'} -> ${newState}`);
    this.emit('stateChange', { from: prev, to: newState });
  }

  // ---- Human checkpoint methods ----

  approve() {
    if (this.state !== STATES.AWAITING_APPROVAL) {
      throw new Error(`Cannot approve in state ${this.state}`);
    }
    this._log('Campaign approved by human reviewer');
    if (this.approvalResolve) {
      this.approvalResolve({ action: 'approved' });
    }
  }

  requestChanges(changes) {
    if (this.state !== STATES.AWAITING_APPROVAL) {
      throw new Error(`Cannot request changes in state ${this.state}`);
    }
    this._log(`Changes requested: ${JSON.stringify(changes)}`);
    if (this.approvalResolve) {
      this.approvalResolve({ action: 'changes_requested', changes });
    }
  }

  reject(reason) {
    if (this.state !== STATES.AWAITING_APPROVAL) {
      throw new Error(`Cannot reject in state ${this.state}`);
    }
    this._log(`Campaign rejected: ${reason}`);
    if (this.approvalResolve) {
      this.approvalResolve({ action: 'rejected', reason });
    }
  }

  // ---- State handlers ----

  async _parseIntent(intent) {
    this._transition(STATES.PARSE_INTENT);
    const parsed = await mockServiceCall('intent-parser', {
      campaignType: intent.type || 'promotional',
      channel: intent.channel || 'push',
      targetAudience: intent.audience || 'all_active_users',
      objective: intent.objective || 'engagement',
      scheduledTime: intent.scheduledTime || null,
      rawIntent: intent,
    }, this.options.mockDelay);
    this._log(`Parsed intent: type=${parsed.campaignType}, channel=${parsed.channel}, audience=${parsed.targetAudience}`);
    this.campaignData.intent = parsed;
    return parsed;
  }

  async _buildCohort() {
    this._transition(STATES.BUILD_COHORT);
    const cohort = await mockServiceCall('cohort-builder', {
      cohortId: `cohort_${Date.now()}`,
      size: 150000,
      criteria: this.campaignData.intent.targetAudience,
      segments: [
        { name: 'high_value', count: 30000 },
        { name: 'medium_value', count: 70000 },
        { name: 'low_value', count: 50000 },
      ],
    }, this.options.mockDelay);
    this._log(`Built cohort ${cohort.cohortId} with ${cohort.size} users`);
    this.campaignData.cohort = cohort;
    return cohort;
  }

  async _filterConsent() {
    this._transition(STATES.FILTER_CONSENT);
    const originalSize = this.campaignData.cohort.size;
    const consentResult = await mockServiceCall('consent-service', {
      eligible: Math.floor(originalSize * 0.85),
      filtered: Math.floor(originalSize * 0.15),
      reasons: {
        no_opt_in: Math.floor(originalSize * 0.08),
        explicit_opt_out: Math.floor(originalSize * 0.05),
        consent_expired: Math.floor(originalSize * 0.02),
      },
    }, this.options.mockDelay);
    this._log(`Consent filter: ${consentResult.eligible} eligible, ${consentResult.filtered} filtered out`);
    this.campaignData.consent = consentResult;
    this.campaignData.currentReach = consentResult.eligible;
    return consentResult;
  }

  async _filterFrequency() {
    this._transition(STATES.FILTER_FREQUENCY);
    const currentReach = this.campaignData.currentReach;
    const freqResult = await mockServiceCall('frequency-cap-service', {
      eligible: Math.floor(currentReach * 0.92),
      capped: Math.floor(currentReach * 0.08),
      capDetails: {
        daily_cap_hit: Math.floor(currentReach * 0.03),
        weekly_cap_hit: Math.floor(currentReach * 0.04),
        channel_cap_hit: Math.floor(currentReach * 0.01),
      },
    }, this.options.mockDelay);
    this._log(`Frequency filter: ${freqResult.eligible} eligible, ${freqResult.capped} capped`);
    this.campaignData.frequency = freqResult;
    this.campaignData.currentReach = freqResult.eligible;
    return freqResult;
  }

  async _dndScrub() {
    this._transition(STATES.DND_SCRUB);
    const currentReach = this.campaignData.currentReach;
    const dndResult = await mockServiceCall('dnd-registry', {
      eligible: Math.floor(currentReach * 0.97),
      scrubbed: Math.floor(currentReach * 0.03),
      dndLastUpdated: new Date().toISOString(),
    }, this.options.mockDelay);
    this._log(`DND scrub: ${dndResult.scrubbed} users on DND removed, ${dndResult.eligible} remaining`);
    this.campaignData.dnd = dndResult;
    this.campaignData.currentReach = dndResult.eligible;
    return dndResult;
  }

  async _cannibalizationCheck() {
    this._transition(STATES.CANNIBALIZATION_CHECK);
    const checkResult = await mockServiceCall('campaign-registry', {
      overlappingCampaigns: [
        { id: 'camp_abc', name: 'Weekend Sale Push', overlap: 0.15 },
        { id: 'camp_def', name: 'New User Onboarding', overlap: 0.05 },
      ],
      maxOverlap: 0.15,
      recommendation: 'proceed',
    }, this.options.mockDelay);
    this._log(`Cannibalization check: ${checkResult.overlappingCampaigns.length} overlapping campaigns, max overlap ${(checkResult.maxOverlap * 100).toFixed(1)}%`);
    this.campaignData.cannibalization = checkResult;
    return checkResult;
  }

  async _estimateReach() {
    this._transition(STATES.ESTIMATE_REACH);
    const reach = this.campaignData.currentReach;
    const estimate = await mockServiceCall('reach-estimator', {
      totalReach: reach,
      estimatedDelivery: Math.floor(reach * 0.95),
      estimatedOpens: Math.floor(reach * 0.25),
      estimatedClicks: Math.floor(reach * 0.04),
      estimatedConversions: Math.floor(reach * 0.012),
      confidence: 0.85,
    }, this.options.mockDelay);
    this._log(`Reach estimate: ${estimate.totalReach} reachable, ~${estimate.estimatedConversions} expected conversions`);
    this.campaignData.reachEstimate = estimate;
    return estimate;
  }

  async _generateCopy() {
    this._transition(STATES.GENERATE_COPY);
    const copy = await mockServiceCall('copy-generator', {
      variants: [
        { id: 'v1', title: 'Flash Sale Alert!', body: 'Grab up to 70% off on top brands. Ends tonight!', cta: 'Shop Now' },
        { id: 'v2', title: 'Deals You Can\'t Miss', body: 'Your favorite brands at unbeatable prices. Limited time only.', cta: 'Explore Deals' },
        { id: 'v3', title: 'Price Drop Inside', body: 'Items in your wishlist just got cheaper. Check it out!', cta: 'View Prices' },
      ],
      generatedAt: new Date().toISOString(),
    }, this.options.mockDelay);
    this._log(`Generated ${copy.variants.length} copy variants`);
    this.campaignData.copy = copy;
    return copy;
  }

  async _benchmarkQuery() {
    this._transition(STATES.BENCHMARK_QUERY);
    const benchmarks = await mockServiceCall('benchmark-service', {
      category: this.campaignData.intent.campaignType,
      channel: this.campaignData.intent.channel,
      benchmarks: {
        deliveryRate: 0.95,
        openRate: 0.22,
        ctr: 0.035,
        conversionRate: 0.012,
        unsubscribeRate: 0.005,
      },
      sampleSize: 50000,
      period: '30d',
    }, this.options.mockDelay);
    this._log(`Benchmarks loaded: openRate=${benchmarks.benchmarks.openRate}, CTR=${benchmarks.benchmarks.ctr}`);
    this.campaignData.benchmarks = benchmarks;
    return benchmarks;
  }

  async _determineApprovalChain() {
    this._transition(STATES.DETERMINE_APPROVAL_CHAIN);
    const reach = this.campaignData.currentReach;
    let approvers;
    if (reach > 500000) {
      approvers = ['team_lead', 'marketing_head', 'vp_growth'];
    } else if (reach > 100000) {
      approvers = ['team_lead', 'marketing_head'];
    } else {
      approvers = ['team_lead'];
    }
    const chain = await mockServiceCall('approval-service', {
      approvers,
      priority: reach > 500000 ? 'high' : 'normal',
      sla: reach > 500000 ? '4h' : '2h',
    }, this.options.mockDelay);
    this._log(`Approval chain: ${chain.approvers.join(' -> ')} (SLA: ${chain.sla})`);
    this.campaignData.approvalChain = chain;
    return chain;
  }

  async _compileBrief() {
    this._transition(STATES.COMPILE_BRIEF);
    const brief = {
      campaignId: `camp_${Date.now()}`,
      intent: this.campaignData.intent,
      cohortSize: this.campaignData.cohort.size,
      finalReach: this.campaignData.currentReach,
      filterSummary: {
        consentFiltered: this.campaignData.consent.filtered,
        frequencyCapped: this.campaignData.frequency.capped,
        dndScrubbed: this.campaignData.dnd.scrubbed,
      },
      cannibalization: this.campaignData.cannibalization.recommendation,
      reachEstimate: this.campaignData.reachEstimate,
      copyVariants: this.campaignData.copy.variants.length,
      benchmarks: this.campaignData.benchmarks.benchmarks,
      approvalChain: this.campaignData.approvalChain,
      compiledAt: new Date().toISOString(),
    };
    this._log(`Brief compiled for campaign ${brief.campaignId}`);
    this.campaignData.brief = brief;
    this.emit('briefCompiled', brief);
    return brief;
  }

  async _awaitApproval() {
    this._transition(STATES.AWAITING_APPROVAL);
    this._log('[HUMAN CHECKPOINT] Waiting for human approval...');
    this.emit('awaitingApproval', this.campaignData.brief);

    this.approvalPromise = new Promise((resolve) => {
      this.approvalResolve = resolve;
    });

    const decision = await this.approvalPromise;
    this.approvalResolve = null;
    this.approvalPromise = null;

    this.campaignData.approvalDecision = decision;
    return decision;
  }

  async _configureAB() {
    this._transition(STATES.CONFIGURE_AB);
    const abConfig = await mockServiceCall('ab-config-service', {
      testId: `ab_${Date.now()}`,
      variants: this.campaignData.copy.variants.map((v, i) => ({
        ...v,
        trafficSplit: i === 0 ? 0.5 : 0.25,
      })),
      primaryMetric: 'conversion_rate',
      secondaryMetrics: ['open_rate', 'ctr'],
      minSampleSize: 10000,
      maxDuration: '7d',
    }, this.options.mockDelay);
    this._log(`A/B test configured: ${abConfig.testId}, ${abConfig.variants.length} variants`);
    this.campaignData.abConfig = abConfig;
    return abConfig;
  }

  async _setSTO() {
    this._transition(STATES.SET_STO);
    const stoConfig = await mockServiceCall('sto-service', {
      strategy: 'per_user_optimal',
      fallbackWindow: { start: '09:00', end: '21:00' },
      timezone: 'Asia/Kolkata',
      modelVersion: 'sto_v3.2',
      coverageRate: 0.78,
    }, this.options.mockDelay);
    this._log(`STO configured: strategy=${stoConfig.strategy}, coverage=${(stoConfig.coverageRate * 100).toFixed(0)}%`);
    this.campaignData.sto = stoConfig;
    return stoConfig;
  }

  async _bindTriggers() {
    this._transition(STATES.BIND_TRIGGERS);
    const triggers = await mockServiceCall('trigger-service', {
      triggers: [
        { type: 'scheduled', time: this.campaignData.intent.scheduledTime || new Date(Date.now() + 3600000).toISOString() },
        { type: 'conversion_stop', condition: 'goal_reached' },
        { type: 'safety_stop', condition: 'unsubscribe_rate > 0.02' },
      ],
      bound: true,
    }, this.options.mockDelay);
    this._log(`Bound ${triggers.triggers.length} triggers`);
    this.campaignData.triggers = triggers;
    return triggers;
  }

  async _registerExperiment() {
    this._transition(STATES.REGISTER_EXPERIMENT);
    const experiment = await mockServiceCall('experiment-registry', {
      experimentId: `exp_${Date.now()}`,
      campaignId: this.campaignData.brief.campaignId,
      abTestId: this.campaignData.abConfig.testId,
      status: 'registered',
      registeredAt: new Date().toISOString(),
    }, this.options.mockDelay);
    this._log(`Experiment registered: ${experiment.experimentId}`);
    this.campaignData.experiment = experiment;
    return experiment;
  }

  async _pushDelivery() {
    this._transition(STATES.PUSH_DELIVERY);
    const delivery = await mockServiceCall('delivery-service', {
      batchId: `batch_${Date.now()}`,
      totalQueued: this.campaignData.currentReach,
      estimatedCompletionTime: new Date(Date.now() + 1800000).toISOString(),
      status: 'delivering',
    }, this.options.mockDelay);
    this._log(`Delivery initiated: ${delivery.totalQueued} messages queued, batch ${delivery.batchId}`);
    this.campaignData.delivery = delivery;
    this.emit('deliveryStarted', delivery);
    return delivery;
  }

  async _monitoring() {
    this._transition(STATES.MONITORING);
    const metrics = await mockServiceCall('monitoring-service', {
      delivered: Math.floor(this.campaignData.currentReach * 0.96),
      opened: Math.floor(this.campaignData.currentReach * 0.24),
      clicked: Math.floor(this.campaignData.currentReach * 0.038),
      converted: Math.floor(this.campaignData.currentReach * 0.013),
      unsubscribed: Math.floor(this.campaignData.currentReach * 0.004),
      bounced: Math.floor(this.campaignData.currentReach * 0.02),
      status: 'healthy',
    }, this.options.mockDelay);
    this._log(`Monitoring snapshot: delivered=${metrics.delivered}, opened=${metrics.opened}, converted=${metrics.converted}, status=${metrics.status}`);
    this.campaignData.monitoringSnapshot = metrics;
    this.emit('monitoringUpdate', metrics);
    return metrics;
  }

  // ---- Main execution ----

  async execute(intent) {
    this._log('Starting Campaign Creation Workflow');
    this.emit('workflowStarted', { intent });

    try {
      await this._parseIntent(intent);
      await this._buildCohort();
      await this._filterConsent();
      await this._filterFrequency();
      await this._dndScrub();
      await this._cannibalizationCheck();
      await this._estimateReach();
      await this._generateCopy();
      await this._benchmarkQuery();
      await this._determineApprovalChain();
      await this._compileBrief();

      // Human checkpoint
      const decision = await this._awaitApproval();

      if (decision.action === 'rejected') {
        this._transition(STATES.REJECTED);
        this._log(`Workflow terminated: campaign rejected - ${decision.reason}`);
        this.emit('workflowCompleted', { status: 'rejected', reason: decision.reason });
        return { status: 'rejected', reason: decision.reason, data: this.campaignData };
      }

      if (decision.action === 'changes_requested') {
        this._transition(STATES.CHANGES_REQUESTED);
        this._log(`Workflow paused: changes requested - ${JSON.stringify(decision.changes)}`);
        this.emit('workflowCompleted', { status: 'changes_requested', changes: decision.changes });
        return { status: 'changes_requested', changes: decision.changes, data: this.campaignData };
      }

      // Approved path
      await this._configureAB();
      await this._setSTO();
      await this._bindTriggers();
      await this._registerExperiment();
      await this._pushDelivery();
      await this._monitoring();

      this._transition(STATES.COMPLETED);
      this._log('Campaign Creation Workflow completed successfully');
      this.emit('workflowCompleted', { status: 'completed' });
      return { status: 'completed', data: this.campaignData };
    } catch (error) {
      this._log(`Workflow error: ${error.message}`);
      this.emit('workflowError', error);
      throw error;
    }
  }
}

module.exports = { CampaignCreationWorkflow, STATES };
