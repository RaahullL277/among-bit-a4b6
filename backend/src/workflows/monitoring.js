'use strict';

const { EventEmitter } = require('events');

const MONITOR_STATES = {
  INITIALIZING: 'INITIALIZING',
  RUNNING: 'RUNNING',
  CHECKING_DELIVERY: 'CHECKING_DELIVERY',
  CHECKING_ENGAGEMENT: 'CHECKING_ENGAGEMENT',
  CHECKING_SAFETY: 'CHECKING_SAFETY',
  ACTION_EXECUTING: 'ACTION_EXECUTING',
  PAUSED: 'PAUSED',
  GENERATING_REPORT: 'GENERATING_REPORT',
  UPDATING_DASHBOARD: 'UPDATING_DASHBOARD',
  COMPLETED: 'COMPLETED',
  ERROR: 'ERROR',
};

const SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
};

const ACTIONS = {
  SWITCH_ROUTE: 'switch_route',
  PAUSE_CAMPAIGN: 'pause_campaign',
  SUGGEST_SWAP: 'suggest_swap',
  RECOMMEND_CREATIVE_SWAP: 'recommend_creative_swap',
  IMMEDIATE_PAUSE: 'immediate_pause',
  NONE: 'none',
};

function mockServiceCall(name, result, delayMs = 30) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(result), delayMs);
  });
}

class CampaignMonitorWorkflow extends EventEmitter {
  constructor(options = {}) {
    super();
    this.state = MONITOR_STATES.INITIALIZING;
    this.campaignId = null;
    this.intervalMs = options.intervalMs || 100; // Default 5 min simulated (compressed)
    this.maxCycles = options.maxCycles || 10;
    this.cycleCount = 0;
    this.alerts = [];
    this.actionsTaken = [];
    this.metricsHistory = [];
    this.isPaused = false;
    this.history = [];
    this.report = null;
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

  _addAlert(severity, category, message, action) {
    const alert = {
      id: `alert_${Date.now()}_${this.alerts.length}`,
      severity,
      category,
      message,
      action,
      cycle: this.cycleCount,
      timestamp: new Date().toISOString(),
    };
    this.alerts.push(alert);
    this.emit('alert', alert);
    return alert;
  }

  async _executeAction(action, details) {
    this._transition(MONITOR_STATES.ACTION_EXECUTING);
    const actionRecord = {
      action,
      details,
      cycle: this.cycleCount,
      timestamp: new Date().toISOString(),
    };
    this.actionsTaken.push(actionRecord);

    switch (action) {
      case ACTIONS.SWITCH_ROUTE:
        await mockServiceCall('route-switcher', { switched: true }, this.options.mockDelay);
        this._log(`ACTION: Switched delivery route - ${details}`);
        break;
      case ACTIONS.PAUSE_CAMPAIGN:
        this.isPaused = true;
        await mockServiceCall('campaign-control', { paused: true }, this.options.mockDelay);
        this._log(`ACTION: Campaign paused - ${details}`);
        this.emit('campaignPaused', { reason: details });
        break;
      case ACTIONS.IMMEDIATE_PAUSE:
        this.isPaused = true;
        await mockServiceCall('campaign-control', { paused: true, immediate: true }, this.options.mockDelay);
        this._log(`ACTION: IMMEDIATE campaign pause - ${details}`);
        this.emit('campaignPaused', { reason: details, immediate: true });
        break;
      case ACTIONS.SUGGEST_SWAP:
        await mockServiceCall('suggestion-service', { suggested: true }, this.options.mockDelay);
        this._log(`ACTION: Suggested subject/copy swap - ${details}`);
        this.emit('suggestionMade', { type: 'swap', details });
        break;
      case ACTIONS.RECOMMEND_CREATIVE_SWAP:
        await mockServiceCall('suggestion-service', { recommended: true }, this.options.mockDelay);
        this._log(`ACTION: Recommended creative swap - ${details}`);
        this.emit('suggestionMade', { type: 'creative_swap', details });
        break;
    }

    this.emit('actionExecuted', actionRecord);
    return actionRecord;
  }

  /**
   * Simulate fetching real-time metrics.
   */
  async _fetchMetrics() {
    const cycleVariation = () => 0.9 + Math.random() * 0.2;
    const degradationFactor = this.cycleCount > 5 ? 0.95 : 1;

    const metrics = await mockServiceCall('metrics-service', {
      delivery: {
        sent: 10000 + this.cycleCount * 2000,
        delivered: Math.floor((10000 + this.cycleCount * 2000) * 0.92 * cycleVariation() * degradationFactor),
        hardBounced: Math.floor((10000 + this.cycleCount * 2000) * 0.03 * cycleVariation()),
        softBounced: Math.floor((10000 + this.cycleCount * 2000) * 0.02 * cycleVariation()),
        carrierBlocked: Math.floor((10000 + this.cycleCount * 2000) * 0.01 * cycleVariation()),
      },
      engagement: {
        opened: Math.floor((10000 + this.cycleCount * 2000) * 0.18 * cycleVariation()),
        clicked: Math.floor((10000 + this.cycleCount * 2000) * 0.025 * cycleVariation()),
        dismissed: Math.floor((10000 + this.cycleCount * 2000) * 0.45 * cycleVariation()),
      },
      safety: {
        unsubscribed: Math.floor((10000 + this.cycleCount * 2000) * 0.004 * cycleVariation()),
        spamReported: Math.floor((10000 + this.cycleCount * 2000) * 0.0005 * cycleVariation()),
        notificationDisabled: Math.floor((10000 + this.cycleCount * 2000) * 0.002 * cycleVariation()),
        notificationDisabledPrev: Math.floor((10000 + this.cycleCount * 2000) * 0.0015 * cycleVariation()),
      },
      fetchedAt: new Date().toISOString(),
    }, this.options.mockDelay);

    this.metricsHistory.push(metrics);
    return metrics;
  }

  /**
   * Delivery health checks.
   */
  async _checkDeliveryHealth(metrics) {
    this._transition(MONITOR_STATES.CHECKING_DELIVERY);
    const d = metrics.delivery;
    const deliveryRate = d.sent > 0 ? d.delivered / d.sent : 1;
    const hardBounceRate = d.sent > 0 ? d.hardBounced / d.sent : 0;
    const carrierBlockRate = d.sent > 0 ? d.carrierBlocked / d.sent : 0;

    this._log(`Delivery: rate=${(deliveryRate * 100).toFixed(1)}%, hardBounce=${(hardBounceRate * 100).toFixed(2)}%, carrierBlock=${(carrierBlockRate * 100).toFixed(2)}%`);

    // Delivery rate < 85% -> switch route
    if (deliveryRate < 0.85) {
      this._addAlert(SEVERITY.WARNING, 'delivery', `Delivery rate ${(deliveryRate * 100).toFixed(1)}% below 85% threshold`, ACTIONS.SWITCH_ROUTE);
      await this._executeAction(ACTIONS.SWITCH_ROUTE, `Delivery rate dropped to ${(deliveryRate * 100).toFixed(1)}%`);
    }

    // Hard bounce > 5% -> pause
    if (hardBounceRate > 0.05) {
      this._addAlert(SEVERITY.CRITICAL, 'delivery', `Hard bounce rate ${(hardBounceRate * 100).toFixed(2)}% exceeds 5% threshold`, ACTIONS.PAUSE_CAMPAIGN);
      await this._executeAction(ACTIONS.PAUSE_CAMPAIGN, `Hard bounce rate at ${(hardBounceRate * 100).toFixed(2)}%`);
    }

    // Carrier block -> pause
    if (carrierBlockRate > 0.03) {
      this._addAlert(SEVERITY.CRITICAL, 'delivery', `Carrier block rate ${(carrierBlockRate * 100).toFixed(2)}% detected`, ACTIONS.PAUSE_CAMPAIGN);
      await this._executeAction(ACTIONS.PAUSE_CAMPAIGN, `Carrier blocks at ${(carrierBlockRate * 100).toFixed(2)}%`);
    }

    return { deliveryRate, hardBounceRate, carrierBlockRate };
  }

  /**
   * Engagement health checks.
   */
  async _checkEngagementHealth(metrics) {
    this._transition(MONITOR_STATES.CHECKING_ENGAGEMENT);
    const d = metrics.delivery;
    const e = metrics.engagement;
    const delivered = d.delivered || 1;

    const openRate = e.opened / delivered;
    const ctr = e.clicked / delivered;
    const dismissRate = e.dismissed / delivered;

    this._log(`Engagement: openRate=${(openRate * 100).toFixed(1)}%, CTR=${(ctr * 100).toFixed(2)}%, dismissRate=${(dismissRate * 100).toFixed(1)}%`);

    // Open rate < 10% -> suggest swap
    if (openRate < 0.10) {
      this._addAlert(SEVERITY.WARNING, 'engagement', `Open rate ${(openRate * 100).toFixed(1)}% below 10%`, ACTIONS.SUGGEST_SWAP);
      await this._executeAction(ACTIONS.SUGGEST_SWAP, `Open rate at ${(openRate * 100).toFixed(1)}% - suggest subject line swap`);
    }

    // CTR < 0.5% -> recommend creative swap
    if (ctr < 0.005) {
      this._addAlert(SEVERITY.WARNING, 'engagement', `CTR ${(ctr * 100).toFixed(2)}% below 0.5%`, ACTIONS.RECOMMEND_CREATIVE_SWAP);
      await this._executeAction(ACTIONS.RECOMMEND_CREATIVE_SWAP, `CTR at ${(ctr * 100).toFixed(2)}% - recommend creative swap`);
    }

    // Dismiss rate > 70% -> pause
    if (dismissRate > 0.70) {
      this._addAlert(SEVERITY.CRITICAL, 'engagement', `Dismiss rate ${(dismissRate * 100).toFixed(1)}% exceeds 70%`, ACTIONS.PAUSE_CAMPAIGN);
      await this._executeAction(ACTIONS.PAUSE_CAMPAIGN, `Dismiss rate at ${(dismissRate * 100).toFixed(1)}%`);
    }

    return { openRate, ctr, dismissRate };
  }

  /**
   * Safety health checks.
   */
  async _checkSafetyHealth(metrics) {
    this._transition(MONITOR_STATES.CHECKING_SAFETY);
    const d = metrics.delivery;
    const s = metrics.safety;
    const delivered = d.delivered || 1;

    const unsubRate = s.unsubscribed / delivered;
    const spamRate = s.spamReported / delivered;
    const disableSpike = s.notificationDisabledPrev > 0
      ? (s.notificationDisabled - s.notificationDisabledPrev) / s.notificationDisabledPrev
      : 0;

    this._log(`Safety: unsubRate=${(unsubRate * 100).toFixed(2)}%, spamRate=${(spamRate * 100).toFixed(3)}%, disableSpike=${(disableSpike * 100).toFixed(1)}%`);

    // Unsubscribe > 2% -> immediate pause
    if (unsubRate > 0.02) {
      this._addAlert(SEVERITY.CRITICAL, 'safety', `Unsubscribe rate ${(unsubRate * 100).toFixed(2)}% exceeds 2%`, ACTIONS.IMMEDIATE_PAUSE);
      await this._executeAction(ACTIONS.IMMEDIATE_PAUSE, `Unsubscribe rate at ${(unsubRate * 100).toFixed(2)}%`);
    }

    // Spam > 0.1% -> immediate pause
    if (spamRate > 0.001) {
      this._addAlert(SEVERITY.CRITICAL, 'safety', `Spam rate ${(spamRate * 100).toFixed(3)}% exceeds 0.1%`, ACTIONS.IMMEDIATE_PAUSE);
      await this._executeAction(ACTIONS.IMMEDIATE_PAUSE, `Spam rate at ${(spamRate * 100).toFixed(3)}%`);
    }

    // Notification disable spike > 50% increase -> pause
    if (disableSpike > 0.5) {
      this._addAlert(SEVERITY.CRITICAL, 'safety', `Notification disable spike ${(disableSpike * 100).toFixed(1)}% detected`, ACTIONS.IMMEDIATE_PAUSE);
      await this._executeAction(ACTIONS.IMMEDIATE_PAUSE, `Notification disable spike at ${(disableSpike * 100).toFixed(1)}%`);
    }

    return { unsubRate, spamRate, disableSpike };
  }

  /**
   * Generate post-campaign report.
   */
  async generateReport() {
    this._transition(MONITOR_STATES.GENERATING_REPORT);

    const lastMetrics = this.metricsHistory[this.metricsHistory.length - 1];
    if (!lastMetrics) {
      this._log('No metrics available for report generation');
      return null;
    }

    const d = lastMetrics.delivery;
    const e = lastMetrics.engagement;
    const s = lastMetrics.safety;
    const delivered = d.delivered || 1;

    this.report = {
      campaignId: this.campaignId,
      generatedAt: new Date().toISOString(),
      monitoringCycles: this.cycleCount,
      delivery: {
        totalSent: d.sent,
        totalDelivered: d.delivered,
        deliveryRate: parseFloat((d.delivered / d.sent).toFixed(4)),
        hardBounceRate: parseFloat((d.hardBounced / d.sent).toFixed(4)),
        softBounceRate: parseFloat((d.softBounced / d.sent).toFixed(4)),
      },
      engagement: {
        opens: e.opened,
        openRate: parseFloat((e.opened / delivered).toFixed(4)),
        clicks: e.clicked,
        ctr: parseFloat((e.clicked / delivered).toFixed(4)),
        dismissRate: parseFloat((e.dismissed / delivered).toFixed(4)),
      },
      safety: {
        unsubscribes: s.unsubscribed,
        unsubscribeRate: parseFloat((s.unsubscribed / delivered).toFixed(6)),
        spamReports: s.spamReported,
        spamRate: parseFloat((s.spamReported / delivered).toFixed(6)),
      },
      alerts: {
        total: this.alerts.length,
        critical: this.alerts.filter((a) => a.severity === SEVERITY.CRITICAL).length,
        warning: this.alerts.filter((a) => a.severity === SEVERITY.WARNING).length,
      },
      actionsTaken: this.actionsTaken.length,
      wasPaused: this.isPaused,
    };

    this._log(`Post-campaign report generated: ${this.report.delivery.totalSent} sent, ${this.alerts.length} alerts`);
    this.emit('reportGenerated', this.report);
    return this.report;
  }

  /**
   * Simulate dashboard update.
   */
  async _updateDashboard(metrics) {
    this._transition(MONITOR_STATES.UPDATING_DASHBOARD);
    await mockServiceCall('dashboard-service', {
      updated: true,
      campaignId: this.campaignId,
      cycle: this.cycleCount,
    }, this.options.mockDelay);
    this._log(`Dashboard updated for cycle #${this.cycleCount}`);
    this.emit('dashboardUpdated', { cycle: this.cycleCount });
  }

  /**
   * Run one monitoring cycle.
   */
  async _runCycle() {
    this.cycleCount++;
    this._log(`--- Monitoring cycle #${this.cycleCount} ---`);

    const metrics = await this._fetchMetrics();

    await this._checkDeliveryHealth(metrics);
    if (this.isPaused) return { paused: true };

    await this._checkEngagementHealth(metrics);
    if (this.isPaused) return { paused: true };

    await this._checkSafetyHealth(metrics);
    if (this.isPaused) return { paused: true };

    await this._updateDashboard(metrics);

    return { paused: false, cycle: this.cycleCount };
  }

  /**
   * Execute the monitoring daemon.
   */
  async execute(campaignId) {
    this.campaignId = campaignId || `camp_${Date.now()}`;
    this._transition(MONITOR_STATES.RUNNING);
    this._log(`Starting monitoring for campaign ${this.campaignId}`);
    this.emit('workflowStarted', { campaignId: this.campaignId });

    try {
      for (let i = 0; i < this.maxCycles; i++) {
        if (this.isPaused) {
          this._log('Campaign is paused, stopping monitoring');
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, this.intervalMs));
        const result = await this._runCycle();

        if (result.paused) {
          this._log('Campaign paused during monitoring, stopping');
          break;
        }
      }

      const report = await this.generateReport();

      this._transition(MONITOR_STATES.COMPLETED);
      this._log('Monitoring completed');
      this.emit('workflowCompleted', { status: 'completed', report });
      return { status: 'completed', report, alerts: this.alerts, actionsTaken: this.actionsTaken };
    } catch (error) {
      this._transition(MONITOR_STATES.ERROR);
      this._log(`Monitoring error: ${error.message}`);
      this.emit('workflowError', error);
      throw error;
    }
  }

  resume() {
    this.isPaused = false;
    this._transition(MONITOR_STATES.RUNNING);
    this._log('Monitoring resumed');
    this.emit('monitoringResumed');
  }
}

module.exports = { CampaignMonitorWorkflow, MONITOR_STATES, SEVERITY, ACTIONS };
