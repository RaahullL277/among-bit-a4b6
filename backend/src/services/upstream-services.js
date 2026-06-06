/**
 * @module upstream-services
 * @description Mock implementations of all upstream services consumed by the NudgeOps AI agent.
 * Each service simulates async operations with realistic latency and mock data.
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simulate async latency.
 * @param {number} ms - Base delay in milliseconds.
 * @returns {Promise<void>}
 */
const delay = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms + Math.random() * 20));

/**
 * Optionally throw to simulate upstream failure.
 * @param {string} serviceName
 * @param {boolean} simulateFailure
 */
function maybeThrow(serviceName, simulateFailure) {
  if (simulateFailure) {
    const err = new Error(`${serviceName}: simulated upstream failure`);
    err.code = 'UPSTREAM_FAILURE';
    throw err;
  }
}

/**
 * Wrap a service call with logging, delay, and optional failure simulation.
 * @param {string} serviceName
 * @param {string} method
 * @param {Function} fn - The actual handler returning mock data.
 * @param {object} [opts]
 * @param {boolean} [opts.simulateFailure=false]
 * @param {number} [opts.delayMs=30]
 * @returns {Promise<*>}
 */
async function serviceCall(serviceName, method, fn, opts = {}) {
  const { simulateFailure = false, delayMs = 30 } = opts;
  const callId = uuidv4().slice(0, 8);
  logger.info(`[${serviceName}] ${method} called`, { callId });
  await delay(delayMs);
  maybeThrow(serviceName, simulateFailure);
  const result = fn(callId);
  logger.info(`[${serviceName}] ${method} completed`, { callId });
  return result;
}

// ---------------------------------------------------------------------------
// Mock data generators
// ---------------------------------------------------------------------------

const CITIES = ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad'];
const SEGMENTS = ['high_value', 'deal_seeker', 'new_user', 'dormant', 'loyal', 'at_risk'];
const CATEGORIES = ['electronics', 'fashion', 'grocery', 'home', 'beauty', 'sports', 'books'];
const CHANNELS = ['push', 'sms', 'email', 'whatsapp', 'in_app'];
const PROVIDERS = ['provider_a', 'provider_b', 'provider_c'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function mockUserProfile(userId) {
  return {
    userId,
    name: `User_${userId.slice(0, 6)}`,
    email: `user_${userId.slice(0, 6)}@example.com`,
    phone: `+91${randomInt(7000000000, 9999999999)}`,
    demographics: {
      age: randomInt(18, 65),
      gender: pick(['male', 'female', 'non_binary']),
      city: pick(CITIES),
      state: 'Karnataka',
      pincode: `${randomInt(500000, 600000)}`,
    },
    preferences: {
      language: pick(['en', 'hi', 'ta', 'te', 'kn']),
      favoriteCategories: [pick(CATEGORIES), pick(CATEGORIES)],
      notificationPreference: pick(CHANNELS),
    },
    jurisdiction: 'IN',
    tier: pick(['platinum', 'gold', 'silver', 'standard']),
    accountCreated: '2022-03-15T10:00:00Z',
    lastActive: new Date(Date.now() - randomInt(0, 7) * 86400000).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// UserProfileService
// ---------------------------------------------------------------------------

const UserProfileService = {
  async getProfile(userId, { simulateFailure = false } = {}) {
    return serviceCall('UserProfileService', 'getProfile', () => mockUserProfile(userId), { simulateFailure });
  },

  async getSegment(userId, { simulateFailure = false } = {}) {
    return serviceCall('UserProfileService', 'getSegment', () => ({
      userId,
      segment: pick(SEGMENTS),
      confidence: +(Math.random() * 0.4 + 0.6).toFixed(2),
      updatedAt: new Date().toISOString(),
    }), { simulateFailure });
  },

  async getBulkProfiles(userIds, { simulateFailure = false } = {}) {
    return serviceCall('UserProfileService', 'getBulkProfiles', () =>
      userIds.map((uid) => mockUserProfile(uid)),
    { simulateFailure, delayMs: 60 });
  },
};

// ---------------------------------------------------------------------------
// BehaviourStreamService
// ---------------------------------------------------------------------------

const BehaviourStreamService = {
  _subscribers: [],

  async getRecentBehaviour(userId, days = 7, { simulateFailure = false } = {}) {
    return serviceCall('BehaviourStreamService', 'getRecentBehaviour', () => {
      const events = [];
      const types = ['page_view', 'add_to_cart', 'wishlist_add', 'search', 'purchase', 'app_open'];
      for (let i = 0; i < randomInt(5, 20); i++) {
        events.push({
          eventId: uuidv4(),
          userId,
          eventType: pick(types),
          category: pick(CATEGORIES),
          productId: `PROD_${uuidv4().slice(0, 8)}`,
          timestamp: new Date(Date.now() - randomInt(0, days * 86400) * 1000).toISOString(),
          metadata: { sessionId: uuidv4().slice(0, 8), platform: pick(['app', 'web', 'mweb']) },
        });
      }
      return { userId, days, events };
    }, { simulateFailure });
  },

  subscribe(eventType, callback) {
    this._subscribers.push({ eventType, callback });
    logger.info('[BehaviourStreamService] subscribe', { eventType });
    return { subscriptionId: uuidv4(), eventType, status: 'active' };
  },

  getStream() {
    logger.info('[BehaviourStreamService] getStream called');
    return { streamId: uuidv4(), status: 'connected', eventsPerSecond: randomInt(100, 500) };
  },
};

// ---------------------------------------------------------------------------
// RecommendationService
// ---------------------------------------------------------------------------

const RecommendationService = {
  async getRecommendations(userId, category = null, count = 10, { simulateFailure = false } = {}) {
    return serviceCall('RecommendationService', 'getRecommendations', () => {
      const items = [];
      const cat = category || pick(CATEGORIES);
      for (let i = 0; i < count; i++) {
        items.push({
          productId: `PROD_${uuidv4().slice(0, 8)}`,
          name: `${cat.charAt(0).toUpperCase() + cat.slice(1)} Item ${i + 1}`,
          category: cat,
          score: +(Math.random() * 0.5 + 0.5).toFixed(3),
          price: randomInt(200, 25000),
          imageUrl: `https://cdn.flipkart.com/img/${uuidv4().slice(0, 8)}.jpg`,
        });
      }
      return { userId, category: cat, recommendations: items };
    }, { simulateFailure });
  },

  async getTrending(category, { simulateFailure = false } = {}) {
    return serviceCall('RecommendationService', 'getTrending', () => ({
      category,
      trendingProducts: Array.from({ length: 5 }, (_, i) => ({
        productId: `PROD_${uuidv4().slice(0, 8)}`,
        name: `Trending ${category} #${i + 1}`,
        rank: i + 1,
        velocityScore: +(Math.random() * 100).toFixed(1),
      })),
      computedAt: new Date().toISOString(),
    }), { simulateFailure });
  },

  async refreshVectors({ simulateFailure = false } = {}) {
    return serviceCall('RecommendationService', 'refreshVectors', () => ({
      status: 'refreshed',
      vectorsUpdated: randomInt(50000, 200000),
      completedAt: new Date().toISOString(),
    }), { simulateFailure, delayMs: 80 });
  },
};

// ---------------------------------------------------------------------------
// PricingService
// ---------------------------------------------------------------------------

const PricingService = {
  async getPrice(productId, { simulateFailure = false } = {}) {
    return serviceCall('PricingService', 'getPrice', () => {
      const mrp = randomInt(500, 30000);
      const discount = randomInt(5, 40);
      return {
        productId,
        mrp,
        sellingPrice: Math.round(mrp * (1 - discount / 100)),
        discount: `${discount}%`,
        currency: 'INR',
        lastUpdated: new Date().toISOString(),
      };
    }, { simulateFailure });
  },

  async getPriceHistory(productId, { simulateFailure = false } = {}) {
    return serviceCall('PricingService', 'getPriceHistory', () => {
      const history = [];
      let price = randomInt(800, 20000);
      for (let i = 30; i >= 0; i -= 3) {
        price = price + randomInt(-500, 500);
        if (price < 200) price = 200;
        history.push({
          date: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10),
          price,
        });
      }
      return { productId, history, currency: 'INR' };
    }, { simulateFailure });
  },

  async checkPriceDrop(productId, { simulateFailure = false } = {}) {
    return serviceCall('PricingService', 'checkPriceDrop', () => {
      const dropped = Math.random() > 0.5;
      return {
        productId,
        hasPriceDrop: dropped,
        previousPrice: dropped ? randomInt(2000, 20000) : null,
        currentPrice: dropped ? randomInt(500, 1999) : randomInt(500, 20000),
        dropPercentage: dropped ? randomInt(10, 50) : 0,
        detectedAt: dropped ? new Date().toISOString() : null,
      };
    }, { simulateFailure });
  },
};

// ---------------------------------------------------------------------------
// InventoryService
// ---------------------------------------------------------------------------

const InventoryService = {
  async getStock(productId, { simulateFailure = false } = {}) {
    return serviceCall('InventoryService', 'getStock', () => ({
      productId,
      totalStock: randomInt(0, 5000),
      reservedStock: randomInt(0, 200),
      availableStock: randomInt(0, 4800),
      warehouse: pick(['BLR-01', 'DEL-02', 'MUM-03', 'HYD-04']),
      lastRestocked: new Date(Date.now() - randomInt(0, 7) * 86400000).toISOString(),
    }), { simulateFailure });
  },

  async checkAvailability(productId, { simulateFailure = false } = {}) {
    return serviceCall('InventoryService', 'checkAvailability', () => {
      const available = Math.random() > 0.15;
      return {
        productId,
        available,
        estimatedDeliveryDays: available ? randomInt(1, 7) : null,
        lowStockWarning: available && Math.random() > 0.7,
      };
    }, { simulateFailure });
  },
};

// ---------------------------------------------------------------------------
// ConsentService
// ---------------------------------------------------------------------------

const ConsentService = {
  async checkConsent(userId, channel, { simulateFailure = false } = {}) {
    return serviceCall('ConsentService', 'checkConsent', () => ({
      userId,
      channel,
      consented: Math.random() > 0.1,
      consentVersion: '2.1',
      grantedAt: new Date(Date.now() - randomInt(30, 365) * 86400000).toISOString(),
    }), { simulateFailure });
  },

  async getConsentStatus(userId, { simulateFailure = false } = {}) {
    return serviceCall('ConsentService', 'getConsentStatus', () => {
      const status = {};
      for (const ch of CHANNELS) {
        status[ch] = { consented: Math.random() > 0.1, updatedAt: new Date().toISOString() };
      }
      return { userId, channels: status };
    }, { simulateFailure });
  },

  async revokeConsent(userId, channel, { simulateFailure = false } = {}) {
    return serviceCall('ConsentService', 'revokeConsent', () => ({
      userId,
      channel,
      revoked: true,
      revokedAt: new Date().toISOString(),
    }), { simulateFailure });
  },
};

// ---------------------------------------------------------------------------
// FrequencyCapService
// ---------------------------------------------------------------------------

const FrequencyCapService = {
  _counters: new Map(),

  async checkCap(userId, channel, { simulateFailure = false } = {}) {
    return serviceCall('FrequencyCapService', 'checkCap', () => {
      const key = `${userId}:${channel}`;
      const sent = this._counters.get(key) || randomInt(0, 3);
      const maxPerDay = 3;
      return {
        userId,
        channel,
        sentToday: sent,
        maxPerDay,
        withinCap: sent < maxPerDay,
        remainingToday: Math.max(0, maxPerDay - sent),
      };
    }, { simulateFailure });
  },

  async getCapHeadroom(userId, { simulateFailure = false } = {}) {
    return serviceCall('FrequencyCapService', 'getCapHeadroom', () => {
      const headroom = {};
      for (const ch of CHANNELS) {
        const sent = randomInt(0, 3);
        headroom[ch] = { sent, max: 3, remaining: Math.max(0, 3 - sent) };
      }
      return { userId, headroom, computedAt: new Date().toISOString() };
    }, { simulateFailure });
  },

  async incrementCount(userId, channel, { simulateFailure = false } = {}) {
    return serviceCall('FrequencyCapService', 'incrementCount', () => {
      const key = `${userId}:${channel}`;
      const current = (this._counters.get(key) || 0) + 1;
      this._counters.set(key, current);
      return { userId, channel, newCount: current, timestamp: new Date().toISOString() };
    }, { simulateFailure });
  },

  async resetCaps({ simulateFailure = false } = {}) {
    return serviceCall('FrequencyCapService', 'resetCaps', () => {
      const size = this._counters.size;
      this._counters.clear();
      return { cleared: size, resetAt: new Date().toISOString() };
    }, { simulateFailure });
  },
};

// ---------------------------------------------------------------------------
// CampaignRegistryService
// ---------------------------------------------------------------------------

const CampaignRegistryService = {
  _campaigns: new Map(),

  async register(campaign, { simulateFailure = false } = {}) {
    return serviceCall('CampaignRegistryService', 'register', () => {
      const id = campaign.id || uuidv4();
      const entry = {
        campaignId: id,
        name: campaign.name,
        channel: campaign.channel || pick(CHANNELS),
        cohortSize: campaign.cohortSize || randomInt(1000, 500000),
        status: 'registered',
        registeredAt: new Date().toISOString(),
      };
      this._campaigns.set(id, entry);
      return entry;
    }, { simulateFailure });
  },

  async getActiveCampaigns({ simulateFailure = false } = {}) {
    return serviceCall('CampaignRegistryService', 'getActiveCampaigns', () => {
      const active = Array.from(this._campaigns.values()).filter(
        (c) => c.status === 'registered' || c.status === 'active'
      );
      // Always return at least some mock campaigns
      if (active.length === 0) {
        return {
          campaigns: Array.from({ length: 3 }, (_, i) => ({
            campaignId: uuidv4(),
            name: `Campaign_${i + 1}`,
            channel: pick(CHANNELS),
            cohortSize: randomInt(5000, 200000),
            status: 'active',
            registeredAt: new Date(Date.now() - randomInt(1, 14) * 86400000).toISOString(),
          })),
          total: 3,
        };
      }
      return { campaigns: active, total: active.length };
    }, { simulateFailure });
  },

  async checkOverlap(cohort, { simulateFailure = false } = {}) {
    return serviceCall('CampaignRegistryService', 'checkOverlap', () => ({
      cohortId: cohort.id || uuidv4(),
      overlappingCampaigns: randomInt(0, 2),
      overlapPercentage: +(Math.random() * 15).toFixed(1),
      details: [
        {
          campaignId: uuidv4(),
          campaignName: 'Existing Campaign A',
          overlapUsers: randomInt(100, 5000),
        },
      ],
    }), { simulateFailure });
  },

  async deregister(campaignId, { simulateFailure = false } = {}) {
    return serviceCall('CampaignRegistryService', 'deregister', () => {
      this._campaigns.delete(campaignId);
      return { campaignId, deregistered: true, deregisteredAt: new Date().toISOString() };
    }, { simulateFailure });
  },
};

// ---------------------------------------------------------------------------
// ExperimentService
// ---------------------------------------------------------------------------

const ExperimentService = {
  _experiments: new Map(),

  async createExperiment(config, { simulateFailure = false } = {}) {
    return serviceCall('ExperimentService', 'createExperiment', () => {
      const id = uuidv4();
      const experiment = {
        experimentId: id,
        name: config.name || `Experiment_${id.slice(0, 6)}`,
        variants: config.variants || [
          { id: 'control', name: 'Control', allocation: 50 },
          { id: 'variant_a', name: 'Variant A', allocation: 50 },
        ],
        status: 'active',
        createdAt: new Date().toISOString(),
        targetSampleSize: config.targetSampleSize || randomInt(5000, 50000),
      };
      this._experiments.set(id, experiment);
      return experiment;
    }, { simulateFailure });
  },

  async assignVariant(userId, experimentId, { simulateFailure = false } = {}) {
    return serviceCall('ExperimentService', 'assignVariant', () => {
      const variant = Math.random() > 0.5 ? 'control' : 'variant_a';
      return {
        userId,
        experimentId,
        assignedVariant: variant,
        assignedAt: new Date().toISOString(),
      };
    }, { simulateFailure });
  },

  async getResults(experimentId, { simulateFailure = false } = {}) {
    return serviceCall('ExperimentService', 'getResults', () => ({
      experimentId,
      status: 'running',
      sampleSize: randomInt(2000, 30000),
      variants: {
        control: {
          impressions: randomInt(5000, 15000),
          clicks: randomInt(200, 1500),
          conversions: randomInt(50, 500),
          ctr: +(Math.random() * 5 + 1).toFixed(2),
          conversionRate: +(Math.random() * 3 + 0.5).toFixed(2),
        },
        variant_a: {
          impressions: randomInt(5000, 15000),
          clicks: randomInt(200, 1500),
          conversions: randomInt(50, 500),
          ctr: +(Math.random() * 5 + 1).toFixed(2),
          conversionRate: +(Math.random() * 3 + 0.5).toFixed(2),
        },
      },
      statisticalSignificance: +(Math.random() * 0.3 + 0.7).toFixed(3),
      confidence: +(Math.random() * 10 + 90).toFixed(1),
      computedAt: new Date().toISOString(),
    }), { simulateFailure });
  },

  async endExperiment(experimentId, { simulateFailure = false } = {}) {
    return serviceCall('ExperimentService', 'endExperiment', () => {
      const exp = this._experiments.get(experimentId);
      if (exp) exp.status = 'completed';
      return {
        experimentId,
        status: 'completed',
        endedAt: new Date().toISOString(),
        winner: pick(['control', 'variant_a']),
      };
    }, { simulateFailure });
  },
};

// ---------------------------------------------------------------------------
// CreativeAssetService
// ---------------------------------------------------------------------------

const CreativeAssetService = {
  async getTemplate(templateId, { simulateFailure = false } = {}) {
    return serviceCall('CreativeAssetService', 'getTemplate', () => ({
      templateId,
      name: `Template_${templateId}`,
      channel: pick(CHANNELS),
      type: pick(['promotional', 'transactional', 'reminder', 'reengagement']),
      content: {
        title: 'Hi {{user_name}}, check this out!',
        body: 'We have a special {{discount}}% off on {{product_name}} just for you.',
        cta: 'Shop Now',
        imageUrl: `https://cdn.flipkart.com/templates/${templateId}.png`,
      },
      variables: ['user_name', 'discount', 'product_name'],
      compliance: { approved: true, reviewedAt: new Date().toISOString() },
      version: randomInt(1, 5),
    }), { simulateFailure });
  },

  async validateTemplate(template, { simulateFailure = false } = {}) {
    return serviceCall('CreativeAssetService', 'validateTemplate', () => {
      const issues = [];
      if (template.body && template.body.length > 160 && template.channel === 'sms') {
        issues.push({ field: 'body', issue: 'SMS body exceeds 160 characters' });
      }
      return {
        valid: issues.length === 0,
        issues,
        checkedAt: new Date().toISOString(),
      };
    }, { simulateFailure });
  },

  async getFallbackTemplate(channel, { simulateFailure = false } = {}) {
    return serviceCall('CreativeAssetService', 'getFallbackTemplate', () => ({
      templateId: `fallback_${channel}`,
      channel,
      content: {
        title: 'Something special for you!',
        body: 'Visit Flipkart for exciting deals and offers.',
        cta: 'Explore',
      },
      isFallback: true,
    }), { simulateFailure });
  },
};

// ---------------------------------------------------------------------------
// DeliveryInfrastructure
// ---------------------------------------------------------------------------

const DeliveryInfrastructure = {
  _activeProvider: 'provider_a',

  async send(message, { simulateFailure = false } = {}) {
    return serviceCall('DeliveryInfrastructure', 'send', () => {
      const messageId = uuidv4();
      const delivered = Math.random() > 0.05;
      return {
        messageId,
        userId: message.userId,
        channel: message.channel,
        provider: this._activeProvider,
        status: delivered ? 'delivered' : 'failed',
        deliveredAt: delivered ? new Date().toISOString() : null,
        failureReason: delivered ? null : pick(['timeout', 'invalid_token', 'rate_limited']),
      };
    }, { simulateFailure });
  },

  async getBulkStatus(messageIds, { simulateFailure = false } = {}) {
    return serviceCall('DeliveryInfrastructure', 'getBulkStatus', () =>
      messageIds.map((id) => ({
        messageId: id,
        status: pick(['delivered', 'delivered', 'delivered', 'pending', 'failed']),
        updatedAt: new Date().toISOString(),
      })),
    { simulateFailure, delayMs: 50 });
  },

  async switchRoute(provider, { simulateFailure = false } = {}) {
    return serviceCall('DeliveryInfrastructure', 'switchRoute', () => {
      const previousProvider = this._activeProvider;
      this._activeProvider = provider;
      return {
        previousProvider,
        newProvider: provider,
        switchedAt: new Date().toISOString(),
      };
    }, { simulateFailure });
  },

  async getDeliveryStats({ simulateFailure = false } = {}) {
    return serviceCall('DeliveryInfrastructure', 'getDeliveryStats', () => ({
      provider: this._activeProvider,
      stats: {
        totalSent: randomInt(50000, 500000),
        delivered: randomInt(45000, 480000),
        failed: randomInt(500, 5000),
        pending: randomInt(100, 2000),
        deliveryRate: +(Math.random() * 5 + 94).toFixed(2),
        avgLatencyMs: randomInt(50, 500),
      },
      period: 'last_24h',
      computedAt: new Date().toISOString(),
    }), { simulateFailure });
  },
};

// ---------------------------------------------------------------------------
// DNDRegistryService
// ---------------------------------------------------------------------------

const DNDRegistryService = {
  async checkDND(phoneNumber, { simulateFailure = false } = {}) {
    return serviceCall('DNDRegistryService', 'checkDND', () => ({
      phoneNumber,
      isDND: Math.random() > 0.85,
      registeredOn: Math.random() > 0.85 ? new Date(Date.now() - randomInt(30, 365) * 86400000).toISOString() : null,
      checkedAt: new Date().toISOString(),
    }), { simulateFailure });
  },

  async bulkCheckDND(phoneNumbers, { simulateFailure = false } = {}) {
    return serviceCall('DNDRegistryService', 'bulkCheckDND', () => ({
      results: phoneNumbers.map((pn) => ({
        phoneNumber: pn,
        isDND: Math.random() > 0.85,
      })),
      totalChecked: phoneNumbers.length,
      dndCount: Math.round(phoneNumbers.length * 0.15),
      checkedAt: new Date().toISOString(),
    }), { simulateFailure, delayMs: 50 });
  },
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  UserProfileService,
  BehaviourStreamService,
  RecommendationService,
  PricingService,
  InventoryService,
  ConsentService,
  FrequencyCapService,
  CampaignRegistryService,
  ExperimentService,
  CreativeAssetService,
  DeliveryInfrastructure,
  DNDRegistryService,
};
