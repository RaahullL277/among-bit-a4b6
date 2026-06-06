'use strict';

const { EventEmitter } = require('events');

const LEARNING_STATES = {
  INITIALIZING: 'INITIALIZING',
  GENERATING_REPORT: 'GENERATING_REPORT',
  EXTRACTING_LEARNINGS: 'EXTRACTING_LEARNINGS',
  UPDATING_KNOWLEDGE_BASE: 'UPDATING_KNOWLEDGE_BASE',
  GENERATING_NBA: 'GENERATING_NBA',
  FEEDING_ML: 'FEEDING_ML',
  COMPLETED: 'COMPLETED',
  ERROR: 'ERROR',
};

function mockServiceCall(name, result, delayMs = 30) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(result), delayMs);
  });
}

class LearningLoopWorkflow extends EventEmitter {
  constructor(options = {}) {
    super();
    this.state = LEARNING_STATES.INITIALIZING;
    this.campaignId = null;
    this.performanceReport = null;
    this.learnings = null;
    this.knowledgeBaseUpdates = [];
    this.nextBestActions = [];
    this.mlFeedback = null;
    this.history = [];
    this.options = { mockDelay: options.mockDelay || 30, ...options };
  }

  _log(message) {
    const entry = { timestamp: new Date().toISOString(), state: this.state, message };
    this.history.push(entry);
    this.emit('log', entry);
  }

  _transition(newState) {
    const prev = this.state;
    this.state = newState;
    this._log(`Transition: ${prev} -> ${newState}`);
    this.emit('stateChange', { from: prev, to: newState });
  }

  // ---- Generate Performance Report ----

  async generatePerformanceReport(campaignData = {}) {
    this._transition(LEARNING_STATES.GENERATING_REPORT);
    this._log(`Generating performance report for campaign ${this.campaignId}`);

    // Delivery metrics
    const delivery = await mockServiceCall('delivery-analytics', {
      totalSent: campaignData.totalSent || 120000,
      delivered: campaignData.delivered || 114000,
      deliveryRate: 0.95,
      hardBounced: 2400,
      softBounced: 3600,
      latencyP50Ms: 120,
      latencyP99Ms: 850,
    }, this.options.mockDelay);

    // Engagement metrics
    const engagement = await mockServiceCall('engagement-analytics', {
      opens: campaignData.opens || 28500,
      openRate: 0.25,
      uniqueOpens: 25000,
      clicks: campaignData.clicks || 5700,
      ctr: 0.05,
      uniqueClicks: 4800,
      timeToOpen: { p50: '2h 15m', p90: '18h 30m' },
      timeToClick: { p50: '3m 20s', p90: '45m' },
    }, this.options.mockDelay);

    // Conversion metrics
    const conversion = await mockServiceCall('conversion-analytics', {
      totalConversions: campaignData.conversions || 1710,
      conversionRate: 0.015,
      revenue: campaignData.revenue || 4275000,
      averageOrderValue: 2500,
      attributionWindow: '7d',
      firstTouch: 1200,
      lastTouch: 1710,
    }, this.options.mockDelay);

    // Incremental lift
    const lift = await mockServiceCall('lift-analytics', {
      controlGroupSize: 12000,
      controlConversions: 120,
      controlConversionRate: 0.01,
      treatmentConversionRate: 0.015,
      incrementalLift: 0.50,
      incrementalConversions: 570,
      incrementalRevenue: 1425000,
      confidence: 0.95,
    }, this.options.mockDelay);

    // Channel breakdown
    const channelBreakdown = await mockServiceCall('channel-analytics', {
      channels: [
        {
          channel: 'push',
          sent: 80000,
          delivered: 76000,
          opened: 19000,
          clicked: 3800,
          converted: 1140,
          deliveryRate: 0.95,
          openRate: 0.25,
          ctr: 0.05,
          conversionRate: 0.015,
        },
        {
          channel: 'email',
          sent: 30000,
          delivered: 28500,
          opened: 7125,
          clicked: 1425,
          converted: 428,
          deliveryRate: 0.95,
          openRate: 0.25,
          ctr: 0.05,
          conversionRate: 0.015,
        },
        {
          channel: 'sms',
          sent: 10000,
          delivered: 9500,
          opened: 2375,
          clicked: 475,
          converted: 142,
          deliveryRate: 0.95,
          openRate: 0.25,
          ctr: 0.05,
          conversionRate: 0.015,
        },
      ],
    }, this.options.mockDelay);

    this.performanceReport = {
      campaignId: this.campaignId,
      generatedAt: new Date().toISOString(),
      delivery,
      engagement,
      conversion,
      incrementalLift: lift,
      channelBreakdown: channelBreakdown.channels,
    };

    this._log(`Performance report generated: ${delivery.deliveryRate * 100}% delivery, ${engagement.openRate * 100}% opens, ${conversion.conversionRate * 100}% conversion, ${(lift.incrementalLift * 100).toFixed(0)}% lift`);
    this.emit('reportGenerated', this.performanceReport);
    return this.performanceReport;
  }

  // ---- Extract Learnings ----

  async extractLearnings() {
    this._transition(LEARNING_STATES.EXTRACTING_LEARNINGS);
    this._log('Extracting learnings from campaign performance');

    // Winning copy variant analysis
    const copyAnalysis = await mockServiceCall('copy-analyzer', {
      variants: [
        { id: 'v1', title: 'Flash Sale Alert!', openRate: 0.28, ctr: 0.06, convRate: 0.018 },
        { id: 'v2', title: 'Deals You Can\'t Miss', openRate: 0.22, ctr: 0.04, convRate: 0.012 },
        { id: 'v3', title: 'Price Drop Inside', openRate: 0.25, ctr: 0.055, convRate: 0.016 },
      ],
      winner: { id: 'v1', reason: 'Highest conversion rate at 1.8% with statistical significance p=0.03' },
      insights: [
        'Action-oriented titles ("Alert!", "Now!") drive 27% higher open rates',
        'Discount percentages in body copy increase CTR by 15%',
        'Urgency language ("Ends tonight") improves conversion by 22%',
      ],
    }, this.options.mockDelay);

    // Best channel analysis
    const channelAnalysis = await mockServiceCall('channel-analyzer', {
      bestChannel: 'push',
      reasoning: 'Push notifications delivered 50% higher conversion rate vs email and 3x vs SMS',
      channelRanking: [
        { channel: 'push', score: 0.92, convRate: 0.015 },
        { channel: 'email', score: 0.78, convRate: 0.010 },
        { channel: 'sms', score: 0.65, convRate: 0.005 },
      ],
      insight: 'Push is most effective for flash-sale type campaigns during evening hours',
    }, this.options.mockDelay);

    // Cohort performance analysis
    const cohortAnalysis = await mockServiceCall('cohort-analyzer', {
      topPerformingSegments: [
        { segment: 'high_value_active', convRate: 0.035, size: 30000 },
        { segment: 'medium_value_recent', convRate: 0.018, size: 45000 },
        { segment: 'price_sensitive', convRate: 0.022, size: 20000 },
      ],
      underperforming: [
        { segment: 'lapsed_60d', convRate: 0.003, size: 15000, suggestion: 'Exclude from promotional; use reactivation flow' },
        { segment: 'low_value_infrequent', convRate: 0.005, size: 10000, suggestion: 'Deeper discounts or different channel' },
      ],
      insight: 'High-value active users convert at 3.5x the average. Lapsed users drag overall metrics down.',
    }, this.options.mockDelay);

    // STO effectiveness analysis
    const stoAnalysis = await mockServiceCall('sto-analyzer', {
      stoEnabled: true,
      stoLift: 0.12,
      bestHours: [10, 13, 19, 20, 21],
      worstHours: [2, 3, 4, 5, 6],
      personalizationCoverage: 0.78,
      insight: 'STO improved open rates by 12%. Evening hours (7-9 PM IST) show peak engagement.',
      modelAccuracy: 0.73,
    }, this.options.mockDelay);

    this.learnings = {
      campaignId: this.campaignId,
      extractedAt: new Date().toISOString(),
      winningCopy: copyAnalysis,
      bestChannel: channelAnalysis,
      cohortPerformance: cohortAnalysis,
      stoEffectiveness: stoAnalysis,
    };

    this._log(`Learnings extracted: winner copy=${copyAnalysis.winner.id}, best channel=${channelAnalysis.bestChannel}, STO lift=${(stoAnalysis.stoLift * 100).toFixed(0)}%`);
    this.emit('learningsExtracted', this.learnings);
    return this.learnings;
  }

  // ---- Update Knowledge Base ----

  async updateKnowledgeBase() {
    this._transition(LEARNING_STATES.UPDATING_KNOWLEDGE_BASE);
    this._log('Updating knowledge base with learnings');

    // Update template library
    const templateUpdate = await mockServiceCall('template-library', {
      updated: true,
      action: 'promote_variant',
      variantId: this.learnings.winningCopy.winner.id,
      newScore: 0.92,
      previousScore: 0.75,
    }, this.options.mockDelay);
    this.knowledgeBaseUpdates.push({
      type: 'template_library',
      detail: `Promoted variant ${templateUpdate.variantId} to score ${templateUpdate.newScore}`,
    });

    // Update benchmarks
    const benchmarkUpdate = await mockServiceCall('benchmark-store', {
      updated: true,
      campaignType: 'promotional_flash_sale',
      newBenchmarks: {
        openRate: this.performanceReport.engagement.openRate,
        ctr: this.performanceReport.engagement.ctr,
        conversionRate: this.performanceReport.conversion.conversionRate,
        deliveryRate: this.performanceReport.delivery.deliveryRate,
      },
      sampleSize: this.performanceReport.delivery.totalSent,
    }, this.options.mockDelay);
    this.knowledgeBaseUpdates.push({
      type: 'benchmarks',
      detail: `Updated benchmarks for promotional_flash_sale with n=${benchmarkUpdate.sampleSize}`,
    });

    // Update STO weights
    const stoUpdate = await mockServiceCall('sto-weights', {
      updated: true,
      adjustedHours: this.learnings.stoEffectiveness.bestHours,
      newWeights: { morning: 0.15, afternoon: 0.25, evening: 0.45, night: 0.15 },
    }, this.options.mockDelay);
    this.knowledgeBaseUpdates.push({
      type: 'sto_weights',
      detail: `Updated STO time-slot weights: evening now ${stoUpdate.newWeights.evening}`,
    });

    // Update channel preferences
    const channelPrefUpdate = await mockServiceCall('channel-pref-store', {
      updated: true,
      campaignType: 'promotional',
      ranking: this.learnings.bestChannel.channelRanking,
    }, this.options.mockDelay);
    this.knowledgeBaseUpdates.push({
      type: 'channel_preferences',
      detail: `Updated channel ranking: ${channelPrefUpdate.ranking.map((c) => c.channel).join(' > ')}`,
    });

    this._log(`Knowledge base updated: ${this.knowledgeBaseUpdates.length} updates applied`);
    this.emit('knowledgeBaseUpdated', this.knowledgeBaseUpdates);
    return this.knowledgeBaseUpdates;
  }

  // ---- Generate Next Best Actions ----

  async generateNextBestActions() {
    this._transition(LEARNING_STATES.GENERATING_NBA);
    this._log('Generating Next Best Action suggestions');

    this.nextBestActions = [];

    // Based on winning copy
    this.nextBestActions.push({
      id: `nba_${Date.now()}_1`,
      type: 'copy_strategy',
      priority: 'high',
      suggestion: 'Use action-oriented, urgency-driven titles for next promotional campaign',
      evidence: `Copy variant "${this.learnings.winningCopy.winner.id}" outperformed by 50% on conversion`,
      expectedImpact: '+15-25% conversion improvement',
    });

    // Based on cohort performance
    const underperforming = this.learnings.cohortPerformance.underperforming;
    if (underperforming.length > 0) {
      this.nextBestActions.push({
        id: `nba_${Date.now()}_2`,
        type: 'audience_strategy',
        priority: 'high',
        suggestion: `Exclude or segment separately: ${underperforming.map((s) => s.segment).join(', ')}`,
        evidence: `These segments converted at <0.5% vs 1.5% campaign average`,
        expectedImpact: '+20-30% overall conversion by focusing on responsive segments',
      });
    }

    // Based on channel analysis
    this.nextBestActions.push({
      id: `nba_${Date.now()}_3`,
      type: 'channel_strategy',
      priority: 'medium',
      suggestion: `Increase ${this.learnings.bestChannel.bestChannel} allocation to 70% for similar campaigns`,
      evidence: this.learnings.bestChannel.reasoning,
      expectedImpact: '+10-15% overall engagement',
    });

    // Based on STO
    if (this.learnings.stoEffectiveness.stoLift > 0.1) {
      this.nextBestActions.push({
        id: `nba_${Date.now()}_4`,
        type: 'timing_strategy',
        priority: 'medium',
        suggestion: 'Continue STO with increased model training data from this campaign',
        evidence: `STO delivered ${(this.learnings.stoEffectiveness.stoLift * 100).toFixed(0)}% lift on open rates`,
        expectedImpact: 'Maintain or improve 12% STO lift',
      });
    }

    // Cross-sell / follow-up suggestion
    const topSegment = this.learnings.cohortPerformance.topPerformingSegments[0];
    if (topSegment) {
      this.nextBestActions.push({
        id: `nba_${Date.now()}_5`,
        type: 'follow_up',
        priority: 'medium',
        suggestion: `Launch cross-sell campaign targeting ${topSegment.segment} converters within 7 days`,
        evidence: `Segment ${topSegment.segment} showed ${(topSegment.convRate * 100).toFixed(1)}% conversion rate`,
        expectedImpact: '+5-10% repeat purchase rate from high-intent segment',
      });
    }

    // Incremental lift insight
    if (this.performanceReport.incrementalLift.incrementalLift > 0) {
      this.nextBestActions.push({
        id: `nba_${Date.now()}_6`,
        type: 'measurement',
        priority: 'low',
        suggestion: 'Maintain holdout group at 10% for continued lift measurement',
        evidence: `Campaign showed ${(this.performanceReport.incrementalLift.incrementalLift * 100).toFixed(0)}% incremental lift with 95% confidence`,
        expectedImpact: 'Better attribution and ROI measurement',
      });
    }

    this._log(`Generated ${this.nextBestActions.length} Next Best Actions`);
    this.emit('nextBestActionsGenerated', this.nextBestActions);
    return this.nextBestActions;
  }

  // ---- Feed back to ML models ----

  async feedMLModels() {
    this._transition(LEARNING_STATES.FEEDING_ML);
    this._log('Feeding learnings back to ML models');

    // STO model feedback
    const stoFeedback = await mockServiceCall('ml-sto-model', {
      model: 'send_time_optimization',
      samplesIngested: this.performanceReport.delivery.totalSent,
      features: ['user_timezone', 'historical_open_time', 'day_of_week', 'campaign_type'],
      targetVariable: 'opened',
      status: 'ingested',
      nextRetrainScheduled: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    }, this.options.mockDelay);

    // Copy scoring model feedback
    const copyFeedback = await mockServiceCall('ml-copy-model', {
      model: 'copy_effectiveness',
      variantsScored: this.learnings.winningCopy.variants.length,
      features: ['title_length', 'urgency_words', 'discount_mention', 'cta_type', 'emoji_count'],
      targetVariable: 'conversion_rate',
      status: 'ingested',
    }, this.options.mockDelay);

    // Cohort prediction model feedback
    const cohortFeedback = await mockServiceCall('ml-cohort-model', {
      model: 'cohort_response_prediction',
      segmentsEvaluated: [
        ...this.learnings.cohortPerformance.topPerformingSegments,
        ...this.learnings.cohortPerformance.underperforming,
      ].length,
      accuracyOnThisCampaign: 0.81,
      status: 'ingested',
    }, this.options.mockDelay);

    // Channel selection model feedback
    const channelFeedback = await mockServiceCall('ml-channel-model', {
      model: 'channel_selection',
      channelPerformance: this.performanceReport.channelBreakdown,
      status: 'ingested',
    }, this.options.mockDelay);

    this.mlFeedback = {
      feedbackAt: new Date().toISOString(),
      models: [stoFeedback, copyFeedback, cohortFeedback, channelFeedback],
      totalSamplesIngested: stoFeedback.samplesIngested,
    };

    this._log(`Fed ${this.mlFeedback.models.length} ML models with campaign data`);
    this.emit('mlModelsFed', this.mlFeedback);
    return this.mlFeedback;
  }

  // ---- Main Execution ----

  async execute(campaignId, campaignData = {}) {
    this.campaignId = campaignId || `camp_${Date.now()}`;
    this.emit('workflowStarted', { campaignId: this.campaignId });

    try {
      const report = await this.generatePerformanceReport(campaignData);
      const learnings = await this.extractLearnings();
      const kbUpdates = await this.updateKnowledgeBase();
      const nba = await this.generateNextBestActions();
      const mlFeedback = await this.feedMLModels();

      this._transition(LEARNING_STATES.COMPLETED);

      const summary = {
        campaignId: this.campaignId,
        performanceReport: report,
        learnings,
        knowledgeBaseUpdates: kbUpdates,
        nextBestActions: nba,
        mlFeedback,
        completedAt: new Date().toISOString(),
      };

      this._log('Post-campaign learning loop completed');
      this.emit('workflowCompleted', summary);
      return summary;
    } catch (error) {
      this._transition(LEARNING_STATES.ERROR);
      this._log(`Error: ${error.message}`);
      this.emit('workflowError', error);
      throw error;
    }
  }
}

module.exports = { LearningLoopWorkflow, LEARNING_STATES };
