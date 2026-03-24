'use strict';

const { EventEmitter } = require('events');

const TRIGGER_STATES = {
  INITIALIZING: 'INITIALIZING',
  LISTENING: 'LISTENING',
  EVENT_RECEIVED: 'EVENT_RECEIVED',
  CONSENT_CHECK: 'CONSENT_CHECK',
  FREQUENCY_CHECK: 'FREQUENCY_CHECK',
  DEDUP_CHECK: 'DEDUP_CHECK',
  EVENT_LOGIC: 'EVENT_LOGIC',
  FIRING_NUDGE: 'FIRING_NUDGE',
  BLOCKED: 'BLOCKED',
  LOGGING: 'LOGGING',
  COMPLETED: 'COMPLETED',
  ERROR: 'ERROR',
};

const EVENT_TYPES = {
  CART_ABANDON: 'cart_abandon',
  PRICE_DROP: 'price_drop',
  BACK_IN_STOCK: 'back_in_stock',
  ORDER_DELIVERED: 'order_delivered',
  APP_OPEN_AFTER_INACTIVITY: 'app_open_after_inactivity',
  SEARCH_NO_RESULTS: 'search_no_results',
};

function mockServiceCall(name, result, delayMs = 30) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(result), delayMs);
  });
}

class EventTriggerWorkflow extends EventEmitter {
  constructor(options = {}) {
    super();
    this.state = TRIGGER_STATES.INITIALIZING;
    this.eventLog = [];
    this.nudgesFired = [];
    this.blockedEvents = [];
    this.history = [];
    this.registeredHandlers = new Map();
    this.activeCampaigns = new Map(); // eventType -> [{ campaignId, priority, template }]
    this.options = { mockDelay: options.mockDelay || 30, ...options };
    this._registerDefaultHandlers();
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

  // ---- Hard Blocks (applied to ALL events) ----

  async _checkConsent(userId) {
    this._transition(TRIGGER_STATES.CONSENT_CHECK);
    const consent = await mockServiceCall('consent-service', {
      userId,
      hasConsent: Math.random() > 0.1,
      consentType: 'transactional',
      lastUpdated: new Date().toISOString(),
    }, this.options.mockDelay);

    if (!consent.hasConsent) {
      this._log(`BLOCKED: User ${userId} has no consent`);
      return { allowed: false, reason: 'no_consent' };
    }
    return { allowed: true };
  }

  async _checkFrequencyCap(userId) {
    this._transition(TRIGGER_STATES.FREQUENCY_CHECK);
    const freq = await mockServiceCall('frequency-service', {
      userId,
      messagesThisHour: Math.floor(Math.random() * 3),
      messagesThisDay: Math.floor(Math.random() * 6),
      messagesThisWeek: Math.floor(Math.random() * 15),
      hourlyLimit: 2,
      dailyLimit: 5,
      weeklyLimit: 15,
    }, this.options.mockDelay);

    if (freq.messagesThisHour >= freq.hourlyLimit) {
      this._log(`BLOCKED: User ${userId} hit hourly frequency cap (${freq.messagesThisHour}/${freq.hourlyLimit})`);
      return { allowed: false, reason: 'hourly_cap' };
    }
    if (freq.messagesThisDay >= freq.dailyLimit) {
      this._log(`BLOCKED: User ${userId} hit daily frequency cap (${freq.messagesThisDay}/${freq.dailyLimit})`);
      return { allowed: false, reason: 'daily_cap' };
    }
    if (freq.messagesThisWeek >= freq.weeklyLimit) {
      this._log(`BLOCKED: User ${userId} hit weekly frequency cap (${freq.messagesThisWeek}/${freq.weeklyLimit})`);
      return { allowed: false, reason: 'weekly_cap' };
    }
    return { allowed: true };
  }

  // ---- Dedup: same event multiple campaigns -> pick highest priority ----

  async _dedup(eventType, userId) {
    this._transition(TRIGGER_STATES.DEDUP_CHECK);

    const campaigns = this.activeCampaigns.get(eventType) || [];
    if (campaigns.length <= 1) {
      return campaigns[0] || null;
    }

    // Sort by priority descending and pick highest
    const sorted = [...campaigns].sort((a, b) => b.priority - a.priority);
    this._log(`Dedup: ${campaigns.length} campaigns for ${eventType}, selected ${sorted[0].campaignId} (priority ${sorted[0].priority})`);
    return sorted[0];
  }

  // ---- Event-specific logic chains ----

  _registerDefaultHandlers() {
    this.registeredHandlers.set(EVENT_TYPES.CART_ABANDON, this._handleCartAbandon.bind(this));
    this.registeredHandlers.set(EVENT_TYPES.PRICE_DROP, this._handlePriceDrop.bind(this));
    this.registeredHandlers.set(EVENT_TYPES.BACK_IN_STOCK, this._handleBackInStock.bind(this));
    this.registeredHandlers.set(EVENT_TYPES.ORDER_DELIVERED, this._handleOrderDelivered.bind(this));
    this.registeredHandlers.set(EVENT_TYPES.APP_OPEN_AFTER_INACTIVITY, this._handleAppOpenAfterInactivity.bind(this));
    this.registeredHandlers.set(EVENT_TYPES.SEARCH_NO_RESULTS, this._handleSearchNoResults.bind(this));
  }

  async _handleCartAbandon(userId, eventData) {
    this._transition(TRIGGER_STATES.EVENT_LOGIC);

    // 1. Check cart value > threshold
    const cartValue = eventData.cartValue || 0;
    const threshold = eventData.threshold || 500;
    if (cartValue < threshold) {
      this._log(`Cart abandon: value ${cartValue} below threshold ${threshold}, skipping`);
      return { fire: false, reason: 'below_threshold' };
    }

    // 2. Check if there's already an active cart-abandon campaign for this user
    const activeCampaign = await mockServiceCall('campaign-check', {
      hasActiveCampaign: Math.random() > 0.8,
      campaignId: 'camp_cart_existing',
    }, this.options.mockDelay);

    if (activeCampaign.hasActiveCampaign) {
      this._log(`Cart abandon: user ${userId} already in active cart campaign`);
      return { fire: false, reason: 'active_campaign_exists' };
    }

    // 3. Wait delay (simulated) and recheck if user returned
    this._log(`Cart abandon: waiting delay period before rechecking user return`);
    const returnCheck = await mockServiceCall('user-activity', {
      returnedToCart: Math.random() > 0.7,
    }, this.options.mockDelay);

    if (returnCheck.returnedToCart) {
      this._log(`Cart abandon: user ${userId} returned to cart, suppressing nudge`);
      return { fire: false, reason: 'user_returned' };
    }

    return {
      fire: true,
      nudgeType: 'cart_abandon',
      payload: {
        userId,
        cartValue,
        items: eventData.items || [],
        channel: 'push',
        template: 'cart_abandon_reminder',
        urgency: cartValue > 2000 ? 'high' : 'normal',
      },
    };
  }

  async _handlePriceDrop(userId, eventData) {
    this._transition(TRIGGER_STATES.EVENT_LOGIC);

    const dropPercent = eventData.dropPercent || 0;
    if (dropPercent < 10) {
      this._log(`Price drop: ${dropPercent}% is less than 10% minimum, skipping`);
      return { fire: false, reason: 'insignificant_drop' };
    }

    // Check if user has this item in wishlist or viewed recently
    const interest = await mockServiceCall('user-interest', {
      inWishlist: eventData.inWishlist || Math.random() > 0.5,
      viewedRecently: eventData.viewedRecently || Math.random() > 0.3,
    }, this.options.mockDelay);

    if (!interest.inWishlist && !interest.viewedRecently) {
      this._log(`Price drop: user ${userId} has no interest signal for item`);
      return { fire: false, reason: 'no_interest_signal' };
    }

    return {
      fire: true,
      nudgeType: 'price_drop',
      payload: {
        userId,
        productId: eventData.productId,
        dropPercent,
        newPrice: eventData.newPrice,
        oldPrice: eventData.oldPrice,
        channel: 'push',
        template: 'price_drop_alert',
      },
    };
  }

  async _handleBackInStock(userId, eventData) {
    this._transition(TRIGGER_STATES.EVENT_LOGIC);

    // Check if user registered for back-in-stock alert
    const registration = await mockServiceCall('bis-registry', {
      registered: eventData.registered || Math.random() > 0.3,
      registeredAt: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
    }, this.options.mockDelay);

    if (!registration.registered) {
      this._log(`Back in stock: user ${userId} not registered for alert`);
      return { fire: false, reason: 'not_registered' };
    }

    return {
      fire: true,
      nudgeType: 'back_in_stock',
      payload: {
        userId,
        productId: eventData.productId,
        productName: eventData.productName || 'Product',
        channel: 'push',
        template: 'back_in_stock_alert',
      },
    };
  }

  async _handleOrderDelivered(userId, eventData) {
    this._transition(TRIGGER_STATES.EVENT_LOGIC);

    return {
      fire: true,
      nudgeType: 'post_delivery',
      payload: {
        userId,
        orderId: eventData.orderId,
        channel: 'push',
        template: 'post_delivery_feedback',
        delayMinutes: 120, // Send 2 hours after delivery
        includeRecos: true,
      },
    };
  }

  async _handleAppOpenAfterInactivity(userId, eventData) {
    this._transition(TRIGGER_STATES.EVENT_LOGIC);

    const inactiveDays = eventData.inactiveDays || 0;
    if (inactiveDays < 7) {
      this._log(`App open after inactivity: ${inactiveDays} days is not significant enough`);
      return { fire: false, reason: 'insufficient_inactivity' };
    }

    // Fetch personalized recommendations
    const recos = await mockServiceCall('reco-engine', {
      recommendations: [
        { productId: 'prod_1', score: 0.92 },
        { productId: 'prod_2', score: 0.87 },
        { productId: 'prod_3', score: 0.81 },
      ],
    }, this.options.mockDelay);

    return {
      fire: true,
      nudgeType: 'welcome_back',
      payload: {
        userId,
        inactiveDays,
        channel: 'in_app',
        template: inactiveDays > 30 ? 'welcome_back_long' : 'welcome_back_short',
        recommendations: recos.recommendations,
      },
    };
  }

  async _handleSearchNoResults(userId, eventData) {
    this._transition(TRIGGER_STATES.EVENT_LOGIC);

    const searchQuery = eventData.query || '';
    if (!searchQuery) {
      return { fire: false, reason: 'empty_query' };
    }

    // Check for similar products
    const similar = await mockServiceCall('search-similar', {
      alternatives: eventData.alternatives || [
        { productId: 'alt_1', name: 'Similar Product 1', matchScore: 0.78 },
        { productId: 'alt_2', name: 'Similar Product 2', matchScore: 0.65 },
      ],
    }, this.options.mockDelay);

    if (similar.alternatives.length === 0) {
      this._log(`Search no results: no alternatives found for "${searchQuery}"`);
      return { fire: false, reason: 'no_alternatives' };
    }

    return {
      fire: true,
      nudgeType: 'search_alternatives',
      payload: {
        userId,
        originalQuery: searchQuery,
        channel: 'in_app',
        template: 'search_alternatives',
        alternatives: similar.alternatives,
      },
    };
  }

  // ---- Event logging for ML training ----

  _logEventForML(eventType, userId, eventData, decision, nudgeResult) {
    const mlLogEntry = {
      eventId: `evt_${Date.now()}_${this.eventLog.length}`,
      eventType,
      userId,
      eventData,
      decision: decision.fire ? 'fired' : 'suppressed',
      suppressionReason: decision.fire ? null : decision.reason,
      nudgeType: decision.fire ? decision.nudgeType : null,
      nudgeResult: nudgeResult || null,
      timestamp: new Date().toISOString(),
      features: {
        eventType,
        cartValue: eventData.cartValue,
        inactiveDays: eventData.inactiveDays,
        dropPercent: eventData.dropPercent,
      },
    };
    this.eventLog.push(mlLogEntry);
    this.emit('eventLogged', mlLogEntry);
    return mlLogEntry;
  }

  // ---- Register campaigns for event types ----

  registerCampaign(eventType, campaign) {
    if (!this.activeCampaigns.has(eventType)) {
      this.activeCampaigns.set(eventType, []);
    }
    this.activeCampaigns.get(eventType).push({
      campaignId: campaign.campaignId || `camp_${Date.now()}`,
      priority: campaign.priority || 1,
      template: campaign.template || 'default',
      ...campaign,
    });
    this._log(`Registered campaign ${campaign.campaignId} for event ${eventType} (priority: ${campaign.priority})`);
  }

  // ---- Fire nudge ----

  async _fireNudge(decision) {
    this._transition(TRIGGER_STATES.FIRING_NUDGE);

    const result = await mockServiceCall('nudge-delivery', {
      nudgeId: `nudge_${Date.now()}`,
      delivered: true,
      channel: decision.payload.channel,
      template: decision.payload.template,
      userId: decision.payload.userId,
      firedAt: new Date().toISOString(),
    }, this.options.mockDelay);

    this._log(`Nudge fired: ${result.nudgeId} via ${result.channel} to user ${result.userId}`);
    this.nudgesFired.push(result);
    this.emit('nudgeFired', result);
    return result;
  }

  // ---- Process a single event ----

  async processEvent(eventType, userId, eventData = {}) {
    this._transition(TRIGGER_STATES.EVENT_RECEIVED);
    this._log(`Event received: ${eventType} for user ${userId}`);

    try {
      // Hard block: consent check
      const consentResult = await this._checkConsent(userId);
      if (!consentResult.allowed) {
        this.blockedEvents.push({ eventType, userId, reason: consentResult.reason });
        this._logEventForML(eventType, userId, eventData, { fire: false, reason: consentResult.reason });
        return { fired: false, reason: consentResult.reason };
      }

      // Hard block: frequency cap
      const freqResult = await this._checkFrequencyCap(userId);
      if (!freqResult.allowed) {
        this.blockedEvents.push({ eventType, userId, reason: freqResult.reason });
        this._logEventForML(eventType, userId, eventData, { fire: false, reason: freqResult.reason });
        return { fired: false, reason: freqResult.reason };
      }

      // Dedup: pick highest priority campaign
      const selectedCampaign = await this._dedup(eventType, userId);

      // Run event-specific handler
      const handler = this.registeredHandlers.get(eventType);
      if (!handler) {
        this._log(`No handler registered for event type: ${eventType}`);
        return { fired: false, reason: 'no_handler' };
      }

      const decision = await handler(userId, {
        ...eventData,
        selectedCampaign,
      });

      if (!decision.fire) {
        this._transition(TRIGGER_STATES.BLOCKED);
        this._log(`Event ${eventType} for user ${userId} blocked: ${decision.reason}`);
        this.blockedEvents.push({ eventType, userId, reason: decision.reason });
        this._logEventForML(eventType, userId, eventData, decision);
        return { fired: false, reason: decision.reason };
      }

      // Fire the nudge
      const nudgeResult = await this._fireNudge(decision);

      // Log for ML training
      this._transition(TRIGGER_STATES.LOGGING);
      this._logEventForML(eventType, userId, eventData, decision, nudgeResult);

      return { fired: true, nudgeId: nudgeResult.nudgeId, nudgeType: decision.nudgeType };
    } catch (error) {
      this._transition(TRIGGER_STATES.ERROR);
      this._log(`Error processing event: ${error.message}`);
      this.emit('workflowError', error);
      throw error;
    }
  }

  // ---- Batch process events ----

  async execute(events = []) {
    this._transition(TRIGGER_STATES.LISTENING);
    this._log(`Processing batch of ${events.length} events`);
    this.emit('workflowStarted', { eventCount: events.length });

    const results = [];
    for (const event of events) {
      const result = await this.processEvent(event.type, event.userId, event.data || {});
      results.push({ event, result });
    }

    this._transition(TRIGGER_STATES.COMPLETED);
    const summary = {
      totalEvents: events.length,
      fired: results.filter((r) => r.result.fired).length,
      blocked: results.filter((r) => !r.result.fired).length,
      results,
      eventLog: this.eventLog,
    };

    this._log(`Batch complete: ${summary.fired} nudges fired, ${summary.blocked} blocked`);
    this.emit('workflowCompleted', summary);
    return summary;
  }
}

module.exports = { EventTriggerWorkflow, TRIGGER_STATES, EVENT_TYPES };
