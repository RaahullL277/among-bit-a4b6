'use strict';

const { EventEmitter } = require('events');

const ANOMALY_STATES = {
  INITIALIZING: 'INITIALIZING',
  CROSS_CAMPAIGN_MONITORING: 'CROSS_CAMPAIGN_MONITORING',
  SIGNAL_ANALYSIS: 'SIGNAL_ANALYSIS',
  AUTO_HEALING: 'AUTO_HEALING',
  WEEKLY_AUDIT: 'WEEKLY_AUDIT',
  MONTHLY_REVIEW: 'MONTHLY_REVIEW',
  COMPLETED: 'COMPLETED',
  ERROR: 'ERROR',
};

const ANOMALY_TYPES = {
  GLOBAL_UNSUBSCRIBE_TRENDING: 'global_unsubscribe_trending',
  COHORT_OVER_MESSAGING: 'cohort_over_messaging',
  STALE_RECO_VECTORS: 'stale_reco_vectors',
  CONSENT_SYNC_LAG: 'consent_sync_lag',
  INFRASTRUCTURE_LATENCY: 'infrastructure_latency',
  AB_TRAFFIC_DRIFT: 'ab_traffic_drift',
};

const HEAL_ACTIONS = {
  THROTTLE_CAMPAIGNS: 'throttle_campaigns',
  ENFORCE_FREQUENCY_CAP: 'enforce_frequency_cap',
  TRIGGER_RECO_REFRESH: 'trigger_reco_refresh',
  FORCE_CONSENT_SYNC: 'force_consent_sync',
  SWITCH_INFRA_REGION: 'switch_infra_region',
  REBALANCE_TRAFFIC: 'rebalance_traffic',
  PAUSE_OFFENDING_CAMPAIGNS: 'pause_offending_campaigns',
};

function mockServiceCall(name, result, delayMs = 30) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(result), delayMs);
  });
}

class AnomalyDetectionWorkflow extends EventEmitter {
  constructor(options = {}) {
    super();
    this.state = ANOMALY_STATES.INITIALIZING;
    this.anomalies = [];
    this.healingActions = [];
    this.auditResults = [];
    this.reviewResults = [];
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

  _recordAnomaly(type, severity, details) {
    const anomaly = {
      id: `anomaly_${Date.now()}_${this.anomalies.length}`,
      type,
      severity,
      details,
      detectedAt: new Date().toISOString(),
      healed: false,
    };
    this.anomalies.push(anomaly);
    this.emit('anomalyDetected', anomaly);
    return anomaly;
  }

  // ---- Cross-Campaign Signal Monitoring ----

  async _checkGlobalUnsubscribeTrend() {
    const data = await mockServiceCall('unsubscribe-analytics', {
      currentRate: 0.018,
      previousRate: 0.012,
      trendDirection: 'up',
      percentChange: 50,
      threshold: 30,
    }, this.options.mockDelay);

    if (data.percentChange > data.threshold && data.trendDirection === 'up') {
      const anomaly = this._recordAnomaly(
        ANOMALY_TYPES.GLOBAL_UNSUBSCRIBE_TRENDING,
        'high',
        { currentRate: data.currentRate, previousRate: data.previousRate, percentChange: data.percentChange }
      );
      this._log(`Global unsubscribe trending up ${data.percentChange}%: ${data.previousRate} -> ${data.currentRate}`);
      return anomaly;
    }
    this._log('Global unsubscribe trend: normal');
    return null;
  }

  async _checkCohortOverMessaging() {
    const data = await mockServiceCall('frequency-analytics', {
      overMessagedCohorts: [
        { cohortId: 'cohort_premium', avgMessagesPerWeek: 6.2, userCount: 15000 },
        { cohortId: 'cohort_lapsed', avgMessagesPerWeek: 5.5, userCount: 8000 },
      ],
      threshold: 5,
    }, this.options.mockDelay);

    const overMessaged = data.overMessagedCohorts.filter((c) => c.avgMessagesPerWeek > data.threshold);
    if (overMessaged.length > 0) {
      const anomaly = this._recordAnomaly(
        ANOMALY_TYPES.COHORT_OVER_MESSAGING,
        'medium',
        { cohorts: overMessaged, threshold: data.threshold }
      );
      this._log(`${overMessaged.length} cohorts over-messaged (>${data.threshold}/week)`);
      return anomaly;
    }
    this._log('Cohort messaging frequency: normal');
    return null;
  }

  async _checkStaleRecoVectors() {
    const data = await mockServiceCall('reco-service', {
      lastRefreshed: new Date(Date.now() - 55 * 3600 * 1000).toISOString(),
      maxStalenessHours: 48,
      staleHours: 55,
    }, this.options.mockDelay);

    if (data.staleHours > data.maxStalenessHours) {
      const anomaly = this._recordAnomaly(
        ANOMALY_TYPES.STALE_RECO_VECTORS,
        'medium',
        { lastRefreshed: data.lastRefreshed, staleHours: data.staleHours, threshold: data.maxStalenessHours }
      );
      this._log(`Reco vectors stale: ${data.staleHours}h since last refresh (threshold: ${data.maxStalenessHours}h)`);
      return anomaly;
    }
    this._log('Reco vectors: fresh');
    return null;
  }

  async _checkConsentSyncLag() {
    const data = await mockServiceCall('consent-sync', {
      lastSyncAt: new Date(Date.now() - 75 * 60 * 1000).toISOString(),
      lagMinutes: 75,
      thresholdMinutes: 60,
      pendingUpdates: 3200,
    }, this.options.mockDelay);

    if (data.lagMinutes > data.thresholdMinutes) {
      const anomaly = this._recordAnomaly(
        ANOMALY_TYPES.CONSENT_SYNC_LAG,
        'high',
        { lagMinutes: data.lagMinutes, pendingUpdates: data.pendingUpdates, threshold: data.thresholdMinutes }
      );
      this._log(`Consent sync lag: ${data.lagMinutes}min (threshold: ${data.thresholdMinutes}min), ${data.pendingUpdates} pending`);
      return anomaly;
    }
    this._log('Consent sync: within threshold');
    return null;
  }

  async _checkInfrastructureLatency() {
    const data = await mockServiceCall('infra-monitor', {
      services: [
        { name: 'push-gateway', p99LatencyMs: 250, thresholdMs: 500, status: 'ok' },
        { name: 'sms-gateway', p99LatencyMs: 1200, thresholdMs: 800, status: 'degraded' },
        { name: 'email-relay', p99LatencyMs: 350, thresholdMs: 1000, status: 'ok' },
      ],
    }, this.options.mockDelay);

    const degraded = data.services.filter((s) => s.p99LatencyMs > s.thresholdMs);
    if (degraded.length > 0) {
      const anomaly = this._recordAnomaly(
        ANOMALY_TYPES.INFRASTRUCTURE_LATENCY,
        'high',
        { degradedServices: degraded }
      );
      this._log(`Infrastructure latency: ${degraded.length} services degraded - ${degraded.map((s) => s.name).join(', ')}`);
      return anomaly;
    }
    this._log('Infrastructure latency: normal');
    return null;
  }

  async _checkABTrafficDrift() {
    const data = await mockServiceCall('ab-monitor', {
      tests: [
        { testId: 'ab_123', expectedSplit: [0.5, 0.5], actualSplit: [0.52, 0.48], driftPercent: 4 },
        { testId: 'ab_456', expectedSplit: [0.5, 0.3, 0.2], actualSplit: [0.55, 0.28, 0.17], driftPercent: 10 },
      ],
      driftThreshold: 5,
    }, this.options.mockDelay);

    const drifted = data.tests.filter((t) => t.driftPercent > data.driftThreshold);
    if (drifted.length > 0) {
      const anomaly = this._recordAnomaly(
        ANOMALY_TYPES.AB_TRAFFIC_DRIFT,
        'medium',
        { tests: drifted, threshold: data.driftThreshold }
      );
      this._log(`A/B traffic drift: ${drifted.length} tests drifted beyond ${data.driftThreshold}%`);
      return anomaly;
    }
    this._log('A/B traffic: balanced');
    return null;
  }

  async monitorCrossCampaignSignals() {
    this._transition(ANOMALY_STATES.CROSS_CAMPAIGN_MONITORING);
    this._log('Starting cross-campaign signal monitoring');

    const results = await Promise.all([
      this._checkGlobalUnsubscribeTrend(),
      this._checkCohortOverMessaging(),
      this._checkStaleRecoVectors(),
      this._checkConsentSyncLag(),
      this._checkInfrastructureLatency(),
      this._checkABTrafficDrift(),
    ]);

    const detected = results.filter(Boolean);
    this._log(`Cross-campaign monitoring complete: ${detected.length} anomalies detected`);
    return detected;
  }

  // ---- Auto-Healing ----

  async _healAnomaly(anomaly) {
    this._transition(ANOMALY_STATES.AUTO_HEALING);
    let action;

    switch (anomaly.type) {
      case ANOMALY_TYPES.GLOBAL_UNSUBSCRIBE_TRENDING:
        action = await mockServiceCall('campaign-throttler', {
          action: HEAL_ACTIONS.THROTTLE_CAMPAIGNS,
          throttlePercent: 30,
          affected: 5,
        }, this.options.mockDelay);
        this._log(`Auto-heal: Throttled campaigns by 30% to address unsubscribe trend`);
        break;

      case ANOMALY_TYPES.COHORT_OVER_MESSAGING:
        action = await mockServiceCall('frequency-enforcer', {
          action: HEAL_ACTIONS.ENFORCE_FREQUENCY_CAP,
          cohorts: anomaly.details.cohorts.map((c) => c.cohortId),
          newCap: 5,
        }, this.options.mockDelay);
        this._log(`Auto-heal: Enforced frequency cap of 5/week on ${anomaly.details.cohorts.length} cohorts`);
        break;

      case ANOMALY_TYPES.STALE_RECO_VECTORS:
        action = await mockServiceCall('reco-refresher', {
          action: HEAL_ACTIONS.TRIGGER_RECO_REFRESH,
          triggered: true,
          estimatedCompletionMinutes: 45,
        }, this.options.mockDelay);
        this._log('Auto-heal: Triggered recommendation vector refresh');
        break;

      case ANOMALY_TYPES.CONSENT_SYNC_LAG:
        action = await mockServiceCall('consent-sync-forcer', {
          action: HEAL_ACTIONS.FORCE_CONSENT_SYNC,
          synced: true,
          recordsProcessed: anomaly.details.pendingUpdates,
        }, this.options.mockDelay);
        this._log(`Auto-heal: Forced consent sync for ${anomaly.details.pendingUpdates} pending records`);
        break;

      case ANOMALY_TYPES.INFRASTRUCTURE_LATENCY:
        action = await mockServiceCall('infra-failover', {
          action: HEAL_ACTIONS.SWITCH_INFRA_REGION,
          switchedServices: anomaly.details.degradedServices.map((s) => s.name),
          newRegion: 'ap-south-1b',
        }, this.options.mockDelay);
        this._log(`Auto-heal: Switched ${anomaly.details.degradedServices.length} services to backup region`);
        break;

      case ANOMALY_TYPES.AB_TRAFFIC_DRIFT:
        action = await mockServiceCall('ab-rebalancer', {
          action: HEAL_ACTIONS.REBALANCE_TRAFFIC,
          rebalanced: anomaly.details.tests.map((t) => t.testId),
        }, this.options.mockDelay);
        this._log(`Auto-heal: Rebalanced traffic for ${anomaly.details.tests.length} A/B tests`);
        break;

      default:
        this._log(`No auto-heal available for anomaly type: ${anomaly.type}`);
        return null;
    }

    anomaly.healed = true;
    anomaly.healedAt = new Date().toISOString();

    const healRecord = {
      anomalyId: anomaly.id,
      anomalyType: anomaly.type,
      action,
      timestamp: new Date().toISOString(),
    };
    this.healingActions.push(healRecord);
    this.emit('healingApplied', healRecord);
    return healRecord;
  }

  async autoHealAll() {
    const unhealed = this.anomalies.filter((a) => !a.healed);
    this._log(`Auto-healing ${unhealed.length} anomalies`);
    const results = [];
    for (const anomaly of unhealed) {
      const result = await this._healAnomaly(anomaly);
      if (result) results.push(result);
    }
    return results;
  }

  // ---- Weekly Self-Audit ----

  async runWeeklyAudit() {
    this._transition(ANOMALY_STATES.WEEKLY_AUDIT);
    this._log('Starting weekly self-audit');

    // 1. Valid consent check
    const consentAudit = await mockServiceCall('consent-audit', {
      check: 'valid_consent',
      totalUsers: 500000,
      validConsent: 485000,
      expiredConsent: 10000,
      missingConsent: 5000,
      complianceRate: 0.97,
      status: 'pass',
    }, this.options.mockDelay);
    this._log(`Consent audit: ${consentAudit.complianceRate * 100}% compliance (${consentAudit.status})`);

    // 2. DND scrub freshness
    const dndAudit = await mockServiceCall('dnd-audit', {
      check: 'dnd_scrub_freshness',
      lastScrubAt: new Date(Date.now() - 18 * 3600 * 1000).toISOString(),
      scrubAgingHours: 18,
      maxAgeHours: 24,
      status: 'pass',
    }, this.options.mockDelay);
    this._log(`DND scrub freshness: ${dndAudit.scrubAgingHours}h old (max: ${dndAudit.maxAgeHours}h) - ${dndAudit.status}`);

    // 3. Campaign duration review
    const durationAudit = await mockServiceCall('campaign-audit', {
      check: 'campaign_duration',
      activeCampaigns: 12,
      overrunning: [
        { campaignId: 'camp_old1', daysActive: 35, maxDays: 30 },
      ],
      status: 'warning',
    }, this.options.mockDelay);
    this._log(`Campaign duration: ${durationAudit.overrunning.length} campaigns overrunning (${durationAudit.status})`);

    // 4. Frequency cap spot-check
    const frequencyAudit = await mockServiceCall('frequency-audit', {
      check: 'frequency_cap_spot_check',
      sampledUsers: 10000,
      violations: 12,
      violationRate: 0.0012,
      maxAllowed: 0.005,
      status: 'pass',
    }, this.options.mockDelay);
    this._log(`Frequency cap spot-check: ${frequencyAudit.violations} violations in ${frequencyAudit.sampledUsers} samples (${frequencyAudit.status})`);

    const auditResult = {
      timestamp: new Date().toISOString(),
      checks: [consentAudit, dndAudit, durationAudit, frequencyAudit],
      overallStatus: [consentAudit, dndAudit, durationAudit, frequencyAudit].every((c) => c.status === 'pass') ? 'pass' : 'issues_found',
    };
    this.auditResults.push(auditResult);
    this.emit('weeklyAuditCompleted', auditResult);
    this._log(`Weekly audit completed: ${auditResult.overallStatus}`);
    return auditResult;
  }

  // ---- Monthly Model Performance Review ----

  async runMonthlyReview() {
    this._transition(ANOMALY_STATES.MONTHLY_REVIEW);
    this._log('Starting monthly model performance review');

    const stoReview = await mockServiceCall('sto-model-review', {
      model: 'send_time_optimization',
      accuracy: 0.72,
      previousAccuracy: 0.74,
      drift: -0.02,
      recommendation: 'retrain_scheduled',
    }, this.options.mockDelay);

    const recoReview = await mockServiceCall('reco-model-review', {
      model: 'recommendation_engine',
      accuracy: 0.68,
      previousAccuracy: 0.65,
      drift: 0.03,
      recommendation: 'no_action',
    }, this.options.mockDelay);

    const cohortReview = await mockServiceCall('cohort-model-review', {
      model: 'cohort_prediction',
      accuracy: 0.81,
      previousAccuracy: 0.80,
      drift: 0.01,
      recommendation: 'no_action',
    }, this.options.mockDelay);

    const copyReview = await mockServiceCall('copy-model-review', {
      model: 'copy_generation',
      qualityScore: 0.75,
      previousQualityScore: 0.73,
      drift: 0.02,
      recommendation: 'no_action',
    }, this.options.mockDelay);

    const reviewResult = {
      timestamp: new Date().toISOString(),
      models: [stoReview, recoReview, cohortReview, copyReview],
      modelsNeedingAttention: [stoReview, recoReview, cohortReview, copyReview].filter(
        (m) => m.recommendation !== 'no_action'
      ),
    };
    this.reviewResults.push(reviewResult);
    this.emit('monthlyReviewCompleted', reviewResult);
    this._log(`Monthly review completed: ${reviewResult.modelsNeedingAttention.length} models need attention`);
    return reviewResult;
  }

  // ---- Main execution ----

  async execute() {
    this.emit('workflowStarted', { type: 'anomaly_detection' });

    try {
      // Cross-campaign signal monitoring
      const anomalies = await this.monitorCrossCampaignSignals();

      // Auto-heal detected anomalies
      if (anomalies.length > 0) {
        await this.autoHealAll();
      }

      // Weekly audit
      const auditResult = await this.runWeeklyAudit();

      // Monthly review
      const reviewResult = await this.runMonthlyReview();

      this._transition(ANOMALY_STATES.COMPLETED);
      const summary = {
        anomaliesDetected: this.anomalies.length,
        anomaliesHealed: this.healingActions.length,
        auditStatus: auditResult.overallStatus,
        modelsNeedingAttention: reviewResult.modelsNeedingAttention.length,
        anomalies: this.anomalies,
        healingActions: this.healingActions,
        auditResult,
        reviewResult,
      };
      this._log('Anomaly detection workflow completed');
      this.emit('workflowCompleted', summary);
      return summary;
    } catch (error) {
      this._transition(ANOMALY_STATES.ERROR);
      this._log(`Error: ${error.message}`);
      this.emit('workflowError', error);
      throw error;
    }
  }
}

module.exports = { AnomalyDetectionWorkflow, ANOMALY_STATES, ANOMALY_TYPES, HEAL_ACTIONS };
