'use strict';

const { EventEmitter } = require('events');

const JOURNEY_STATES = {
  INITIALIZING: 'INITIALIZING',
  PARSING_DEFINITION: 'PARSING_DEFINITION',
  BUILDING_STATE_MACHINE: 'BUILDING_STATE_MACHINE',
  RUNNING: 'RUNNING',
  STEP_EXECUTING: 'STEP_EXECUTING',
  WAITING_DELAY: 'WAITING_DELAY',
  CONVERSION_CHECK: 'CONVERSION_CHECK',
  EXIT_CHECK: 'EXIT_CHECK',
  SUPPRESSED: 'SUPPRESSED',
  COMPLETED: 'COMPLETED',
  PAUSED: 'PAUSED',
  ERROR: 'ERROR',
};

const EXIT_REASONS = {
  CONVERSION: 'conversion',
  UNSUBSCRIBE: 'unsubscribe',
  JOURNEY_EXHAUSTED: 'journey_exhausted',
  MANUAL_STOP: 'manual_stop',
  ERROR: 'error',
};

function mockServiceCall(name, result, delayMs = 30) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(result), delayMs);
  });
}

class DripSequenceWorkflow extends EventEmitter {
  constructor(options = {}) {
    super();
    this.state = JOURNEY_STATES.INITIALIZING;
    this.journeyId = `journey_${Date.now()}`;
    this.definition = null;
    this.stepMachine = [];
    this.currentStepIndex = -1;
    this.users = new Map(); // userId -> user journey state
    this.analytics = { steps: {}, overall: { entered: 0, converted: 0, exited: 0, active: 0 } };
    this.conversionListenerActive = false;
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

  /**
   * Parse journey definition.
   * Expected shape:
   * {
   *   name: string,
   *   steps: [{ id, channel, template, delayMinutes }],
   *   conversionGoal: { event, withinHours },
   *   exitConditions: ['unsubscribe', 'conversion', 'journey_exhausted'],
   *   maxDurationDays: number
   * }
   */
  parseDefinition(definition) {
    this._transition(JOURNEY_STATES.PARSING_DEFINITION);

    if (!definition || !definition.steps || definition.steps.length === 0) {
      throw new Error('Journey definition must include at least one step');
    }

    this.definition = {
      name: definition.name || 'Untitled Journey',
      steps: definition.steps.map((step, i) => ({
        id: step.id || `step_${i}`,
        channel: step.channel || 'push',
        template: step.template || `template_${i}`,
        delayMinutes: step.delayMinutes || 0,
        conditions: step.conditions || {},
        order: i,
      })),
      conversionGoal: definition.conversionGoal || { event: 'purchase', withinHours: 72 },
      exitConditions: definition.exitConditions || ['unsubscribe', 'conversion', 'journey_exhausted'],
      maxDurationDays: definition.maxDurationDays || 14,
    };

    this._log(`Parsed journey "${this.definition.name}" with ${this.definition.steps.length} steps`);
    this.emit('definitionParsed', this.definition);
    return this.definition;
  }

  /**
   * Build the internal step-transition state machine.
   */
  buildStateMachine() {
    this._transition(JOURNEY_STATES.BUILDING_STATE_MACHINE);

    this.stepMachine = this.definition.steps.map((step, index) => ({
      ...step,
      next: index < this.definition.steps.length - 1 ? this.definition.steps[index + 1].id : null,
      isLast: index === this.definition.steps.length - 1,
    }));

    // Initialize per-step analytics
    for (const step of this.stepMachine) {
      this.analytics.steps[step.id] = {
        entered: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        converted: 0,
        exited: 0,
        dropoff: 0,
      };
    }

    this._log(`State machine built with ${this.stepMachine.length} steps`);
    this.emit('stateMachineBuilt', this.stepMachine);
    return this.stepMachine;
  }

  /**
   * Enroll a batch of users into the journey.
   */
  async enrollUsers(userIds) {
    const enrolled = [];
    for (const userId of userIds) {
      if (this.users.has(userId)) {
        this._log(`User ${userId} already enrolled, skipping`);
        continue;
      }
      this.users.set(userId, {
        userId,
        currentStepIndex: 0,
        status: 'active',
        enrolledAt: new Date().toISOString(),
        history: [],
        converted: false,
        exitReason: null,
      });
      enrolled.push(userId);
      this.analytics.overall.entered++;
      this.analytics.overall.active++;
    }
    this._log(`Enrolled ${enrolled.length} users (${userIds.length - enrolled.length} duplicates skipped)`);
    this.emit('usersEnrolled', { count: enrolled.length, userIds: enrolled });
    return enrolled;
  }

  /**
   * Simulate the real-time conversion listener.
   */
  startConversionListener() {
    this.conversionListenerActive = true;
    this._log('Conversion listener started');
    this.emit('conversionListenerStarted');
  }

  stopConversionListener() {
    this.conversionListenerActive = false;
    this._log('Conversion listener stopped');
    this.emit('conversionListenerStopped');
  }

  /**
   * Simulate a conversion event for a user.
   */
  async handleConversionEvent(userId, eventData = {}) {
    if (!this.conversionListenerActive) return;

    const userState = this.users.get(userId);
    if (!userState || userState.status !== 'active') return;

    this._log(`Conversion event received for user ${userId}: ${JSON.stringify(eventData)}`);
    userState.converted = true;
    userState.conversionData = eventData;

    // Auto-suppress on conversion
    await this._suppressUser(userId, EXIT_REASONS.CONVERSION);

    const stepId = this.stepMachine[userState.currentStepIndex]?.id;
    if (stepId) {
      this.analytics.steps[stepId].converted++;
    }
    this.analytics.overall.converted++;

    this.emit('userConverted', { userId, eventData });
  }

  /**
   * Simulate an unsubscribe event.
   */
  async handleUnsubscribeEvent(userId) {
    const userState = this.users.get(userId);
    if (!userState || userState.status !== 'active') return;

    this._log(`Unsubscribe event for user ${userId}`);
    await this._suppressUser(userId, EXIT_REASONS.UNSUBSCRIBE);
    this.emit('userUnsubscribed', { userId });
  }

  /**
   * Suppress a user (remove from active journey).
   */
  async _suppressUser(userId, reason) {
    const userState = this.users.get(userId);
    if (!userState) return;

    userState.status = 'exited';
    userState.exitReason = reason;
    userState.exitedAt = new Date().toISOString();
    userState.history.push({ action: 'suppressed', reason, at: userState.exitedAt });

    this.analytics.overall.exited++;
    this.analytics.overall.active--;

    const stepId = this.stepMachine[userState.currentStepIndex]?.id;
    if (stepId) {
      this.analytics.steps[stepId].exited++;
    }

    this._log(`User ${userId} suppressed: ${reason}`);

    // Tag journey-exhausted users
    if (reason === EXIT_REASONS.JOURNEY_EXHAUSTED) {
      await mockServiceCall('tagging-service', { tagged: true }, this.options.mockDelay);
      this._log(`User ${userId} tagged as journey-exhausted`);
    }
  }

  /**
   * Execute a single step for a user.
   */
  async _executeStepForUser(userId, step) {
    const userState = this.users.get(userId);
    if (!userState || userState.status !== 'active') return null;

    // Check exit conditions before executing
    if (userState.converted && this.definition.exitConditions.includes('conversion')) {
      await this._suppressUser(userId, EXIT_REASONS.CONVERSION);
      return { skipped: true, reason: 'converted' };
    }

    this.analytics.steps[step.id].entered++;

    // Simulate delivery
    const deliveryResult = await mockServiceCall('delivery-service', {
      delivered: Math.random() > 0.05,
      channel: step.channel,
      template: step.template,
    }, this.options.mockDelay);

    if (deliveryResult.delivered) {
      this.analytics.steps[step.id].delivered++;
      // Simulate engagement
      const opened = Math.random() < 0.25;
      const clicked = opened && Math.random() < 0.15;
      if (opened) this.analytics.steps[step.id].opened++;
      if (clicked) this.analytics.steps[step.id].clicked++;
    }

    userState.history.push({
      action: 'step_executed',
      stepId: step.id,
      channel: step.channel,
      delivered: deliveryResult.delivered,
      at: new Date().toISOString(),
    });

    userState.currentStepIndex++;

    // Check if journey exhausted
    if (step.isLast) {
      await this._suppressUser(userId, EXIT_REASONS.JOURNEY_EXHAUSTED);
    }

    return deliveryResult;
  }

  /**
   * Run the entire drip sequence for all enrolled users.
   */
  async execute(definition, userIds = []) {
    this._transition(JOURNEY_STATES.RUNNING);
    this.emit('workflowStarted', { journeyId: this.journeyId });

    try {
      this.parseDefinition(definition);
      this.buildStateMachine();

      if (userIds.length > 0) {
        await this.enrollUsers(userIds);
      }

      this.startConversionListener();

      // Execute each step for all active users
      for (const step of this.stepMachine) {
        this._transition(JOURNEY_STATES.STEP_EXECUTING);
        this._log(`Executing step: ${step.id} (channel: ${step.channel})`);

        // Wait for delay if specified
        if (step.delayMinutes > 0) {
          this._transition(JOURNEY_STATES.WAITING_DELAY);
          this._log(`Waiting ${step.delayMinutes} minutes before step ${step.id} (simulated)`);
          await mockServiceCall('delay', null, Math.min(step.delayMinutes, this.options.mockDelay));
        }

        // Execute step for each active user
        const activeUsers = [...this.users.entries()]
          .filter(([, u]) => u.status === 'active')
          .map(([id]) => id);

        this._log(`Processing ${activeUsers.length} active users for step ${step.id}`);

        for (const userId of activeUsers) {
          // Exit check before each user
          this._transition(JOURNEY_STATES.EXIT_CHECK);
          const userState = this.users.get(userId);
          if (userState.status !== 'active') continue;

          this._transition(JOURNEY_STATES.STEP_EXECUTING);
          await this._executeStepForUser(userId, step);
        }

        // Conversion check after step
        this._transition(JOURNEY_STATES.CONVERSION_CHECK);
        const conversions = [...this.users.values()].filter((u) => u.converted).length;
        this._log(`Post-step conversion check: ${conversions} total conversions`);

        this.emit('stepCompleted', { stepId: step.id, analytics: this.analytics.steps[step.id] });
      }

      this.stopConversionListener();

      this._transition(JOURNEY_STATES.COMPLETED);
      this._log('Drip sequence completed');
      this.emit('workflowCompleted', { status: 'completed', analytics: this.getAnalytics() });
      return { status: 'completed', analytics: this.getAnalytics() };
    } catch (error) {
      this._transition(JOURNEY_STATES.ERROR);
      this._log(`Workflow error: ${error.message}`);
      this.emit('workflowError', error);
      throw error;
    }
  }

  /**
   * Get step-level funnel analytics.
   */
  getAnalytics() {
    const funnel = this.stepMachine.map((step) => {
      const stats = this.analytics.steps[step.id];
      return {
        stepId: step.id,
        channel: step.channel,
        ...stats,
        deliveryRate: stats.entered > 0 ? (stats.delivered / stats.entered) : 0,
        openRate: stats.delivered > 0 ? (stats.opened / stats.delivered) : 0,
        clickRate: stats.opened > 0 ? (stats.clicked / stats.opened) : 0,
        conversionRate: stats.entered > 0 ? (stats.converted / stats.entered) : 0,
        dropoffRate: stats.entered > 0 ? (stats.exited / stats.entered) : 0,
      };
    });

    return {
      journeyId: this.journeyId,
      journeyName: this.definition ? this.definition.name : null,
      overall: this.analytics.overall,
      funnel,
      generatedAt: new Date().toISOString(),
    };
  }

  pause() {
    this._transition(JOURNEY_STATES.PAUSED);
    this.stopConversionListener();
    this._log('Journey paused');
    this.emit('journeyPaused');
  }

  resume() {
    this._transition(JOURNEY_STATES.RUNNING);
    this.startConversionListener();
    this._log('Journey resumed');
    this.emit('journeyResumed');
  }
}

module.exports = { DripSequenceWorkflow, JOURNEY_STATES, EXIT_REASONS };
