'use strict';

const { EventEmitter } = require('events');

const AB_STATES = {
  INITIALIZING: 'INITIALIZING',
  VARIANT_ASSIGNMENT: 'VARIANT_ASSIGNMENT',
  RUNNING: 'RUNNING',
  MONITORING: 'MONITORING',
  SAFETY_CHECK: 'SAFETY_CHECK',
  SIGNIFICANCE_CHECK: 'SIGNIFICANCE_CHECK',
  FUTILITY_CHECK: 'FUTILITY_CHECK',
  WINNER_CHECK: 'WINNER_CHECK',
  PAUSED: 'PAUSED',
  GRADUATED: 'GRADUATED',
  KILLED: 'KILLED',
  NO_SIGNIFICANCE: 'NO_SIGNIFICANCE',
  COMPLETED: 'COMPLETED',
  ERROR: 'ERROR',
};

function mockServiceCall(name, result, delayMs = 30) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(result), delayMs);
  });
}

/**
 * Simple deterministic hash for variant assignment.
 * Uses a basic string hash to produce a number in [0, 1).
 */
function deterministicHash(userId, testId) {
  const str = `${userId}:${testId}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit int
  }
  return Math.abs(hash) / 2147483647; // Normalize to [0, 1)
}

/**
 * Simplified z-test for two proportions.
 * Returns { zScore, pValue, significant }.
 */
function calculateSignificance(controlConversions, controlTotal, treatmentConversions, treatmentTotal) {
  if (controlTotal === 0 || treatmentTotal === 0) {
    return { zScore: 0, pValue: 1, significant: false };
  }

  const p1 = controlConversions / controlTotal;
  const p2 = treatmentConversions / treatmentTotal;
  const pPooled = (controlConversions + treatmentConversions) / (controlTotal + treatmentTotal);

  if (pPooled === 0 || pPooled === 1) {
    return { zScore: 0, pValue: 1, significant: false };
  }

  const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / controlTotal + 1 / treatmentTotal));

  if (se === 0) {
    return { zScore: 0, pValue: 1, significant: false };
  }

  const zScore = (p2 - p1) / se;

  // Approximate two-tailed p-value using the error function approximation
  const absZ = Math.abs(zScore);
  // Abramowitz and Stegun approximation for the normal CDF
  const t = 1 / (1 + 0.2316419 * absZ);
  const d = 0.3989422804014327; // 1/sqrt(2*pi)
  const prob = d * Math.exp(-absZ * absZ / 2) *
    (0.3193815 * t + -0.3565638 * t * t + 1.781478 * t * t * t +
     -1.8212560 * t * t * t * t + 1.3302744 * t * t * t * t * t);
  const pValue = 2 * prob; // Two-tailed

  return {
    zScore: parseFloat(zScore.toFixed(4)),
    pValue: parseFloat(pValue.toFixed(6)),
    significant: pValue < 0.05,
  };
}

class ABTestWorkflow extends EventEmitter {
  constructor(options = {}) {
    super();
    this.state = AB_STATES.INITIALIZING;
    this.testId = `ab_${Date.now()}`;
    this.variants = [];
    this.assignments = new Map(); // userId -> variantId
    this.metrics = new Map(); // variantId -> { impressions, conversions, opens, clicks, unsubscribes, deliveryFailures }
    this.monitoringInterval = null;
    this.monitorCycleCount = 0;
    this.startTime = null;
    this.benchmarkConversionRate = 0;
    this.history = [];
    this.options = {
      mockDelay: options.mockDelay || 30,
      monitorIntervalMs: options.monitorIntervalMs || 100, // Simulated 15-min loop (compressed)
      maxMonitorCycles: options.maxMonitorCycles || 10,
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
    this._log(`Transition: ${prev} -> ${newState}`);
    this.emit('stateChange', { from: prev, to: newState });
  }

  /**
   * Initialize the A/B test with variant definitions.
   */
  initialize(config) {
    this.testId = config.testId || this.testId;
    this.variants = config.variants.map((v, i) => ({
      id: v.id || `variant_${i}`,
      name: v.name || (i === 0 ? 'control' : `treatment_${i}`),
      trafficSplit: v.trafficSplit || 1 / config.variants.length,
      isControl: i === 0,
      ...v,
    }));
    this.benchmarkConversionRate = config.benchmarkConversionRate || 0.02;

    // Initialize metric counters per variant
    for (const variant of this.variants) {
      this.metrics.set(variant.id, {
        impressions: 0,
        conversions: 0,
        opens: 0,
        clicks: 0,
        unsubscribes: 0,
        deliveryFailures: 0,
        deliveryAttempts: 0,
      });
    }

    this._log(`Test ${this.testId} initialized with ${this.variants.length} variants`);
    this.emit('testInitialized', { testId: this.testId, variants: this.variants });
    return this;
  }

  /**
   * Assign a user to a variant using deterministic hash.
   */
  assignVariant(userId) {
    if (this.assignments.has(userId)) {
      return this.assignments.get(userId);
    }

    const hashValue = deterministicHash(userId, this.testId);
    let cumulativeSplit = 0;
    let assignedVariant = this.variants[this.variants.length - 1]; // fallback

    for (const variant of this.variants) {
      cumulativeSplit += variant.trafficSplit;
      if (hashValue < cumulativeSplit) {
        assignedVariant = variant;
        break;
      }
    }

    this.assignments.set(userId, assignedVariant.id);
    return assignedVariant.id;
  }

  /**
   * Bulk assign users and simulate initial metrics.
   */
  async assignUsers(userIds) {
    this._transition(AB_STATES.VARIANT_ASSIGNMENT);
    const assignmentCounts = {};

    for (const userId of userIds) {
      const variantId = this.assignVariant(userId);
      assignmentCounts[variantId] = (assignmentCounts[variantId] || 0) + 1;
    }

    this._log(`Assigned ${userIds.length} users: ${JSON.stringify(assignmentCounts)}`);
    this.emit('usersAssigned', { total: userIds.length, distribution: assignmentCounts });
    return assignmentCounts;
  }

  /**
   * Record an event for a user (impression, conversion, etc.).
   */
  recordEvent(userId, eventType) {
    const variantId = this.assignments.get(userId);
    if (!variantId) return;

    const variantMetrics = this.metrics.get(variantId);
    if (!variantMetrics) return;

    if (variantMetrics[eventType] !== undefined) {
      variantMetrics[eventType]++;
    }
  }

  /**
   * Simulate incoming metrics for a monitoring cycle.
   */
  async _simulateMetrics() {
    for (const variant of this.variants) {
      const m = this.metrics.get(variant.id);
      const userCount = [...this.assignments.values()].filter((v) => v === variant.id).length;
      if (userCount === 0) continue;

      // Simulate incremental metrics
      const newImpressions = Math.floor(userCount * 0.1 * (1 + Math.random() * 0.2));
      const baseConvRate = variant.isControl ? 0.02 : 0.025;
      const newConversions = Math.floor(newImpressions * baseConvRate * (0.8 + Math.random() * 0.4));
      const newOpens = Math.floor(newImpressions * (0.2 + Math.random() * 0.1));
      const newClicks = Math.floor(newOpens * (0.1 + Math.random() * 0.05));
      const newUnsubs = Math.floor(newImpressions * (0.003 + Math.random() * 0.002));
      const newFailures = Math.floor(newImpressions * (0.02 + Math.random() * 0.01));

      m.impressions += newImpressions;
      m.conversions += newConversions;
      m.opens += newOpens;
      m.clicks += newClicks;
      m.unsubscribes += newUnsubs;
      m.deliveryFailures += newFailures;
      m.deliveryAttempts += newImpressions;
    }
  }

  /**
   * Safety checks: unsubscribe, delivery failure, conversion benchmark.
   */
  _runSafetyChecks() {
    this._transition(AB_STATES.SAFETY_CHECK);
    const issues = [];

    for (const variant of this.variants) {
      const m = this.metrics.get(variant.id);
      if (m.impressions === 0) continue;

      const unsubRate = m.unsubscribes / m.impressions;
      const deliveryFailRate = m.deliveryAttempts > 0 ? m.deliveryFailures / m.deliveryAttempts : 0;
      const convRate = m.conversions / m.impressions;

      // Unsubscribe > 2% pause
      if (unsubRate > 0.02) {
        issues.push({
          type: 'unsubscribe_high',
          variant: variant.id,
          rate: unsubRate,
          threshold: 0.02,
          action: 'pause',
          message: `Variant ${variant.id}: unsubscribe rate ${(unsubRate * 100).toFixed(2)}% exceeds 2% threshold`,
        });
      }

      // Delivery failure > 15% pause
      if (deliveryFailRate > 0.15) {
        issues.push({
          type: 'delivery_failure_high',
          variant: variant.id,
          rate: deliveryFailRate,
          threshold: 0.15,
          action: 'pause',
          message: `Variant ${variant.id}: delivery failure ${(deliveryFailRate * 100).toFixed(2)}% exceeds 15% threshold`,
        });
      }

      // Conversion < 50% benchmark flag
      if (this.benchmarkConversionRate > 0 && convRate < this.benchmarkConversionRate * 0.5 && m.impressions > 1000) {
        issues.push({
          type: 'conversion_below_benchmark',
          variant: variant.id,
          rate: convRate,
          threshold: this.benchmarkConversionRate * 0.5,
          action: 'flag',
          message: `Variant ${variant.id}: conversion ${(convRate * 100).toFixed(2)}% is below 50% of benchmark`,
        });
      }
    }

    if (issues.length > 0) {
      this._log(`Safety issues detected: ${issues.length}`);
      for (const issue of issues) {
        this._log(`  ${issue.message}`);
      }
      this.emit('safetyIssues', issues);
    }

    return issues;
  }

  /**
   * Sequential testing: futility check and winner check.
   */
  _runSignificanceChecks() {
    this._transition(AB_STATES.SIGNIFICANCE_CHECK);

    const control = this.variants.find((v) => v.isControl);
    if (!control) return { futility: false, winner: null };

    const controlMetrics = this.metrics.get(control.id);
    const results = [];

    for (const variant of this.variants) {
      if (variant.isControl) continue;

      const treatmentMetrics = this.metrics.get(variant.id);
      const stats = calculateSignificance(
        controlMetrics.conversions, controlMetrics.impressions,
        treatmentMetrics.conversions, treatmentMetrics.impressions
      );

      results.push({
        variantId: variant.id,
        controlConvRate: controlMetrics.impressions > 0 ? controlMetrics.conversions / controlMetrics.impressions : 0,
        treatmentConvRate: treatmentMetrics.impressions > 0 ? treatmentMetrics.conversions / treatmentMetrics.impressions : 0,
        ...stats,
        totalSampleSize: controlMetrics.impressions + treatmentMetrics.impressions,
      });
    }

    // Futility check: p < 0.01 and treatment is WORSE -> kill
    this._transition(AB_STATES.FUTILITY_CHECK);
    for (const r of results) {
      if (r.pValue < 0.01 && r.treatmentConvRate < r.controlConvRate) {
        this._log(`Futility detected for ${r.variantId}: p=${r.pValue}, treatment worse than control`);
        this.emit('futilityDetected', r);
        return { futility: true, result: r };
      }
    }

    // Winner check: p < 0.05 AND n > 10000 -> graduate
    this._transition(AB_STATES.WINNER_CHECK);
    for (const r of results) {
      if (r.pValue < 0.05 && r.totalSampleSize > 10000 && r.treatmentConvRate > r.controlConvRate) {
        this._log(`Winner found: ${r.variantId} with p=${r.pValue}, n=${r.totalSampleSize}`);
        this.emit('winnerFound', r);
        return { winner: r.variantId, result: r };
      }
    }

    this._log(`No significance yet. Results: ${JSON.stringify(results.map((r) => ({ v: r.variantId, p: r.pValue, n: r.totalSampleSize })))}`);
    return { futility: false, winner: null, results };
  }

  /**
   * Run one monitoring cycle.
   */
  async _monitorCycle() {
    this.monitorCycleCount++;
    this._transition(AB_STATES.MONITORING);
    this._log(`Monitoring cycle #${this.monitorCycleCount} (simulated 15-minute interval)`);

    await this._simulateMetrics();

    // Safety checks
    const safetyIssues = this._runSafetyChecks();
    const hasPauseIssue = safetyIssues.some((i) => i.action === 'pause');
    if (hasPauseIssue) {
      this._transition(AB_STATES.PAUSED);
      this._log('Test PAUSED due to safety issue');
      this.emit('testPaused', { reason: 'safety', issues: safetyIssues });
      return { action: 'paused', reason: 'safety' };
    }

    // Significance checks
    const sigResult = this._runSignificanceChecks();

    if (sigResult.futility) {
      this._transition(AB_STATES.KILLED);
      this._log(`Test KILLED due to futility: ${JSON.stringify(sigResult.result)}`);
      this.emit('testKilled', sigResult);
      return { action: 'killed', result: sigResult };
    }

    if (sigResult.winner) {
      this._transition(AB_STATES.GRADUATED);
      this._log(`Test GRADUATED: winner is ${sigResult.winner}`);
      this.emit('testGraduated', sigResult);
      return { action: 'graduated', winner: sigResult.winner, result: sigResult };
    }

    // 7-day no-significance notification (simulate as cycle threshold)
    const sevenDayCycles = Math.floor((7 * 24 * 60) / 15); // ~672 cycles in 7 days
    const simulatedSevenDayThreshold = this.options.maxMonitorCycles || 10;
    if (this.monitorCycleCount >= simulatedSevenDayThreshold) {
      this._transition(AB_STATES.NO_SIGNIFICANCE);
      this._log('7-day threshold reached with no significance');
      this.emit('noSignificanceAlert', {
        cyclesRun: this.monitorCycleCount,
        message: `Test ${this.testId} has run for simulated 7 days with no statistical significance`,
      });
      return { action: 'no_significance_alert' };
    }

    return { action: 'continue' };
  }

  /**
   * Run the full A/B test lifecycle.
   */
  async execute(config, userIds = []) {
    this.emit('workflowStarted', { testId: this.testId });
    this.startTime = Date.now();

    try {
      this.initialize(config);

      if (userIds.length > 0) {
        await this.assignUsers(userIds);
      }

      this._transition(AB_STATES.RUNNING);
      this._log('A/B test monitoring loop started');

      // Run monitoring cycles
      let finalResult = null;
      for (let i = 0; i < (this.options.maxMonitorCycles || 10); i++) {
        await new Promise((resolve) => setTimeout(resolve, this.options.monitorIntervalMs || 100));
        const cycleResult = await this._monitorCycle();

        if (cycleResult.action !== 'continue') {
          finalResult = cycleResult;
          break;
        }
      }

      if (!finalResult) {
        finalResult = { action: 'max_cycles_reached' };
        this._log('Maximum monitoring cycles reached');
      }

      this._transition(AB_STATES.COMPLETED);
      const summary = this._generateSummary(finalResult);
      this._log('A/B test lifecycle completed');
      this.emit('workflowCompleted', summary);
      return summary;
    } catch (error) {
      this._transition(AB_STATES.ERROR);
      this._log(`Error: ${error.message}`);
      this.emit('workflowError', error);
      throw error;
    }
  }

  _generateSummary(finalResult) {
    const variantSummaries = this.variants.map((v) => {
      const m = this.metrics.get(v.id);
      return {
        variantId: v.id,
        name: v.name,
        isControl: v.isControl,
        impressions: m.impressions,
        conversions: m.conversions,
        conversionRate: m.impressions > 0 ? parseFloat((m.conversions / m.impressions).toFixed(6)) : 0,
        opens: m.opens,
        clicks: m.clicks,
        unsubscribes: m.unsubscribes,
        deliveryFailures: m.deliveryFailures,
      };
    });

    return {
      testId: this.testId,
      outcome: finalResult.action,
      winner: finalResult.winner || null,
      monitorCycles: this.monitorCycleCount,
      durationMs: Date.now() - this.startTime,
      variants: variantSummaries,
      totalUsers: this.assignments.size,
    };
  }

  /**
   * Get current metrics snapshot.
   */
  getMetricsSnapshot() {
    const snapshot = {};
    for (const [variantId, m] of this.metrics) {
      snapshot[variantId] = { ...m };
    }
    return snapshot;
  }
}

module.exports = { ABTestWorkflow, AB_STATES, calculateSignificance, deterministicHash };
