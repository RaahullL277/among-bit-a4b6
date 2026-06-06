'use strict';

const { EventEmitter } = require('events');

const COHORT_STATES = {
  INITIALIZING: 'INITIALIZING',
  BUILDING_COHORT: 'BUILDING_COHORT',
  VALIDATING: 'VALIDATING',
  SIZE_CHECK: 'SIZE_CHECK',
  OVERLAP_CHECK: 'OVERLAP_CHECK',
  FATIGUE_CHECK: 'FATIGUE_CHECK',
  DIVERSITY_CHECK: 'DIVERSITY_CHECK',
  ENRICHING: 'ENRICHING',
  SUGGESTING_REFINEMENTS: 'SUGGESTING_REFINEMENTS',
  COMPLETED: 'COMPLETED',
  BLOCKED: 'BLOCKED',
  ERROR: 'ERROR',
};

const SIZE_VERDICTS = {
  TOO_SMALL: 'too_small',
  MARGINAL: 'marginal',
  OK: 'ok',
};

const OVERLAP_VERDICTS = {
  CLEAR: 'clear',
  WARNING: 'warning',
  BLOCKED: 'blocked',
};

function mockServiceCall(name, result, delayMs = 30) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(result), delayMs);
  });
}

class CohortManagementWorkflow extends EventEmitter {
  constructor(options = {}) {
    super();
    this.state = COHORT_STATES.INITIALIZING;
    this.cohortId = null;
    this.cohort = null;
    this.validationResults = {};
    this.enrichment = null;
    this.suggestions = [];
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

  // ---- Build Cohort from composable filter logic ----

  /**
   * Evaluate a filter node recursively.
   * Filter structure:
   * { op: 'AND' | 'OR' | 'NOT', filters: [...] }
   * or leaf: { field: 'city', operator: 'eq', value: 'Mumbai' }
   */
  _evaluateFilter(filter, userPool) {
    if (filter.op) {
      switch (filter.op) {
        case 'AND': {
          let result = userPool;
          for (const sub of filter.filters) {
            result = this._evaluateFilter(sub, result);
          }
          return result;
        }
        case 'OR': {
          const sets = filter.filters.map((sub) => this._evaluateFilter(sub, userPool));
          const merged = new Map();
          for (const set of sets) {
            for (const user of set) {
              merged.set(user.id, user);
            }
          }
          return [...merged.values()];
        }
        case 'NOT': {
          const excluded = new Set(
            this._evaluateFilter(filter.filters[0], userPool).map((u) => u.id)
          );
          return userPool.filter((u) => !excluded.has(u.id));
        }
        default:
          throw new Error(`Unknown filter op: ${filter.op}`);
      }
    }

    // Leaf filter
    return userPool.filter((user) => {
      const val = user[filter.field];
      switch (filter.operator) {
        case 'eq': return val === filter.value;
        case 'neq': return val !== filter.value;
        case 'gt': return val > filter.value;
        case 'gte': return val >= filter.value;
        case 'lt': return val < filter.value;
        case 'lte': return val <= filter.value;
        case 'in': return Array.isArray(filter.value) && filter.value.includes(val);
        case 'contains': return typeof val === 'string' && val.includes(filter.value);
        default: return true;
      }
    });
  }

  async buildCohort(filterDefinition, userPool = null) {
    this._transition(COHORT_STATES.BUILDING_COHORT);
    this.cohortId = `cohort_${Date.now()}`;

    // If no user pool provided, generate mock data
    if (!userPool) {
      userPool = await mockServiceCall('user-pool', this._generateMockUserPool(20000), this.options.mockDelay);
    }

    const matchedUsers = this._evaluateFilter(filterDefinition, userPool);

    this.cohort = {
      cohortId: this.cohortId,
      filterDefinition,
      totalPoolSize: userPool.length,
      matchedSize: matchedUsers.length,
      users: matchedUsers,
      createdAt: new Date().toISOString(),
    };

    this._log(`Built cohort ${this.cohortId}: ${matchedUsers.length} users from pool of ${userPool.length}`);
    this.emit('cohortBuilt', { cohortId: this.cohortId, size: matchedUsers.length });
    return this.cohort;
  }

  _generateMockUserPool(size) {
    const cities = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Kolkata', 'Hyderabad', 'Pune', 'Ahmedabad'];
    const tiers = ['platinum', 'gold', 'silver', 'bronze'];
    const languages = ['en', 'hi', 'ta', 'te', 'bn', 'mr', 'kn'];
    const channels = ['push', 'sms', 'email', 'whatsapp'];

    const users = [];
    for (let i = 0; i < size; i++) {
      users.push({
        id: `user_${i}`,
        city: cities[i % cities.length],
        ltvTier: tiers[i % tiers.length],
        language: languages[i % languages.length],
        preferredChannel: channels[i % channels.length],
        lastActiveDay: Math.floor(Math.random() * 90),
        totalOrders: Math.floor(Math.random() * 50),
        appVersion: `${3 + (i % 3)}.${i % 10}.0`,
        hasConsent: Math.random() > 0.1,
        weeklyMessages: Math.floor(Math.random() * 8),
      });
    }
    return users;
  }

  // ---- Validation ----

  async _sizeCheck() {
    this._transition(COHORT_STATES.SIZE_CHECK);
    const size = this.cohort.matchedSize;
    let verdict;
    let message;

    if (size < 1000) {
      verdict = SIZE_VERDICTS.TOO_SMALL;
      message = `Cohort size ${size} is below 1000 - campaign may not yield statistically significant results`;
    } else if (size >= 1000 && size <= 5000) {
      verdict = SIZE_VERDICTS.MARGINAL;
      message = `Cohort size ${size} is marginal (1000-5000) - consider broadening criteria for better significance`;
    } else {
      verdict = SIZE_VERDICTS.OK;
      message = `Cohort size ${size} is adequate for campaign execution`;
    }

    const result = { check: 'size', size, verdict, message };
    this._log(`Size check: ${verdict} - ${message}`);
    this.validationResults.size = result;
    this.emit('validationResult', result);
    return result;
  }

  async _overlapCheck() {
    this._transition(COHORT_STATES.OVERLAP_CHECK);

    // Simulate checking against active campaign cohorts
    const overlapData = await mockServiceCall('cohort-overlap-service', {
      activeCohorts: [
        { cohortId: 'cohort_active_1', name: 'Weekend Promo', overlapPercent: 0.22 },
        { cohortId: 'cohort_active_2', name: 'New Arrivals', overlapPercent: 0.45 },
        { cohortId: 'cohort_active_3', name: 'Reactivation', overlapPercent: 0.08 },
      ],
    }, this.options.mockDelay);

    const maxOverlap = Math.max(...overlapData.activeCohorts.map((c) => c.overlapPercent));
    let verdict;
    let message;

    if (maxOverlap < 0.30) {
      verdict = OVERLAP_VERDICTS.CLEAR;
      message = `Max overlap ${(maxOverlap * 100).toFixed(1)}% is below 30% - clear to proceed`;
    } else if (maxOverlap >= 0.30 && maxOverlap < 0.60) {
      verdict = OVERLAP_VERDICTS.WARNING;
      message = `Max overlap ${(maxOverlap * 100).toFixed(1)}% is between 30-60% - review recommended`;
    } else {
      verdict = OVERLAP_VERDICTS.BLOCKED;
      message = `Max overlap ${(maxOverlap * 100).toFixed(1)}% exceeds 60% - cannot proceed without deduplication`;
    }

    const result = { check: 'overlap', maxOverlap, overlaps: overlapData.activeCohorts, verdict, message };
    this._log(`Overlap check: ${verdict} - ${message}`);
    this.validationResults.overlap = result;
    this.emit('validationResult', result);
    return result;
  }

  async _fatigueCheck() {
    this._transition(COHORT_STATES.FATIGUE_CHECK);

    const users = this.cohort.users;
    const fatiguedCount = users.filter((u) => u.weeklyMessages > 5).length;
    const fatigueRate = users.length > 0 ? fatiguedCount / users.length : 0;

    let verdict;
    if (fatigueRate > 0.3) {
      verdict = 'high_fatigue';
    } else if (fatigueRate > 0.15) {
      verdict = 'moderate_fatigue';
    } else {
      verdict = 'low_fatigue';
    }

    const result = {
      check: 'fatigue',
      fatiguedUsers: fatiguedCount,
      fatigueRate: parseFloat(fatigueRate.toFixed(4)),
      verdict,
      message: `${(fatigueRate * 100).toFixed(1)}% of cohort showing messaging fatigue (>${5}/week)`,
    };
    this._log(`Fatigue check: ${verdict} - ${result.message}`);
    this.validationResults.fatigue = result;
    this.emit('validationResult', result);
    return result;
  }

  async _diversityCheck() {
    this._transition(COHORT_STATES.DIVERSITY_CHECK);

    const users = this.cohort.users;

    // Calculate distributions
    const cityDist = {};
    const tierDist = {};
    const langDist = {};
    for (const user of users) {
      cityDist[user.city] = (cityDist[user.city] || 0) + 1;
      tierDist[user.ltvTier] = (tierDist[user.ltvTier] || 0) + 1;
      langDist[user.language] = (langDist[user.language] || 0) + 1;
    }

    // Check for concentration - if any single segment > 60% of cohort, flag it
    const total = users.length || 1;
    const maxCityConc = Math.max(...Object.values(cityDist)) / total;
    const maxTierConc = Math.max(...Object.values(tierDist)) / total;
    const maxLangConc = Math.max(...Object.values(langDist)) / total;

    const concentrations = [];
    if (maxCityConc > 0.6) concentrations.push({ dimension: 'city', maxConcentration: maxCityConc });
    if (maxTierConc > 0.6) concentrations.push({ dimension: 'ltvTier', maxConcentration: maxTierConc });
    if (maxLangConc > 0.6) concentrations.push({ dimension: 'language', maxConcentration: maxLangConc });

    const verdict = concentrations.length === 0 ? 'diverse' : 'concentrated';

    const result = {
      check: 'diversity',
      distributions: { city: cityDist, ltvTier: tierDist, language: langDist },
      concentrations,
      verdict,
      message: concentrations.length === 0
        ? 'Cohort is well-diversified across dimensions'
        : `Cohort is concentrated in: ${concentrations.map((c) => c.dimension).join(', ')}`,
    };
    this._log(`Diversity check: ${verdict} - ${result.message}`);
    this.validationResults.diversity = result;
    this.emit('validationResult', result);
    return result;
  }

  async validate() {
    this._transition(COHORT_STATES.VALIDATING);
    this._log('Running cohort validation checks');

    const sizeResult = await this._sizeCheck();
    const overlapResult = await this._overlapCheck();
    const fatigueResult = await this._fatigueCheck();
    const diversityResult = await this._diversityCheck();

    // Block if overlap is too high
    if (overlapResult.verdict === OVERLAP_VERDICTS.BLOCKED) {
      this._transition(COHORT_STATES.BLOCKED);
      this._log('Cohort BLOCKED due to high overlap');
      this.emit('cohortBlocked', { reason: 'overlap', details: overlapResult });
      return { passed: false, blocked: true, reason: 'overlap', results: this.validationResults };
    }

    const passed = sizeResult.verdict !== SIZE_VERDICTS.TOO_SMALL;
    return { passed, blocked: false, results: this.validationResults };
  }

  // ---- Enrichment ----

  async enrich() {
    this._transition(COHORT_STATES.ENRICHING);
    this._log('Enriching cohort metadata');

    const users = this.cohort.users;
    const total = users.length || 1;

    // Channel reachability
    const channelReach = {};
    const channels = ['push', 'sms', 'email', 'whatsapp'];
    for (const ch of channels) {
      channelReach[ch] = parseFloat((users.filter((u) => u.preferredChannel === ch).length / total).toFixed(4));
    }

    // Language distribution
    const langDist = {};
    for (const user of users) {
      langDist[user.language] = (langDist[user.language] || 0) + 1;
    }
    for (const lang in langDist) {
      langDist[lang] = parseFloat((langDist[lang] / total).toFixed(4));
    }

    // LTV tier distribution
    const ltvDist = {};
    for (const user of users) {
      ltvDist[user.ltvTier] = (ltvDist[user.ltvTier] || 0) + 1;
    }
    for (const tier in ltvDist) {
      ltvDist[tier] = parseFloat((ltvDist[tier] / total).toFixed(4));
    }

    // Last-active distribution
    const activeDistBuckets = { 'last_7d': 0, '7d_30d': 0, '30d_60d': 0, '60d_plus': 0 };
    for (const user of users) {
      if (user.lastActiveDay <= 7) activeDistBuckets['last_7d']++;
      else if (user.lastActiveDay <= 30) activeDistBuckets['7d_30d']++;
      else if (user.lastActiveDay <= 60) activeDistBuckets['30d_60d']++;
      else activeDistBuckets['60d_plus']++;
    }
    for (const bucket in activeDistBuckets) {
      activeDistBuckets[bucket] = parseFloat((activeDistBuckets[bucket] / total).toFixed(4));
    }

    this.enrichment = {
      cohortId: this.cohortId,
      size: users.length,
      channelReachability: channelReach,
      languageDistribution: langDist,
      ltvTierDistribution: ltvDist,
      lastActiveDistribution: activeDistBuckets,
      enrichedAt: new Date().toISOString(),
    };

    this._log(`Enrichment complete: ${Object.keys(channelReach).length} channels, ${Object.keys(langDist).length} languages, ${Object.keys(ltvDist).length} tiers`);
    this.emit('cohortEnriched', this.enrichment);
    return this.enrichment;
  }

  // ---- Suggest Refinements ----

  async suggestRefinements() {
    this._transition(COHORT_STATES.SUGGESTING_REFINEMENTS);
    this._log('Generating cohort refinement suggestions');
    this.suggestions = [];

    const validation = this.validationResults;
    const enrichment = this.enrichment;

    // Size suggestions
    if (validation.size && validation.size.verdict === SIZE_VERDICTS.TOO_SMALL) {
      this.suggestions.push({
        type: 'expand',
        priority: 'high',
        message: 'Cohort is too small. Consider relaxing filters or adding OR conditions to broaden reach.',
        suggestedAction: 'Relax lastActiveDay threshold from 7 to 30 days',
      });
    }

    if (validation.size && validation.size.verdict === SIZE_VERDICTS.MARGINAL) {
      this.suggestions.push({
        type: 'expand',
        priority: 'medium',
        message: 'Cohort is marginal. Consider slightly broadening criteria for statistical significance.',
        suggestedAction: 'Include adjacent city segments or lower LTV tier threshold',
      });
    }

    // Overlap suggestions
    if (validation.overlap && validation.overlap.verdict === OVERLAP_VERDICTS.WARNING) {
      const highOverlap = validation.overlap.overlaps.filter((o) => o.overlapPercent > 0.3);
      this.suggestions.push({
        type: 'dedup',
        priority: 'medium',
        message: `Significant overlap with ${highOverlap.length} active campaigns. Consider exclusion filters.`,
        suggestedAction: `Add NOT filter excluding users in ${highOverlap.map((o) => o.name).join(', ')}`,
      });
    }

    // Fatigue suggestions
    if (validation.fatigue && validation.fatigue.verdict === 'high_fatigue') {
      this.suggestions.push({
        type: 'filter',
        priority: 'high',
        message: 'High messaging fatigue detected. Filter out users receiving >5 messages/week.',
        suggestedAction: 'Add filter: weeklyMessages <= 5',
      });
    }

    // Diversity suggestions
    if (validation.diversity && validation.diversity.verdict === 'concentrated') {
      for (const conc of validation.diversity.concentrations) {
        this.suggestions.push({
          type: 'diversify',
          priority: 'low',
          message: `Cohort is concentrated on ${conc.dimension} dimension (${(conc.maxConcentration * 100).toFixed(0)}%).`,
          suggestedAction: `Consider splitting into segment-specific campaigns for ${conc.dimension}`,
        });
      }
    }

    // Channel reachability suggestions
    if (enrichment) {
      const lowReachChannels = Object.entries(enrichment.channelReachability)
        .filter(([, rate]) => rate < 0.05)
        .map(([ch]) => ch);
      if (lowReachChannels.length > 0) {
        this.suggestions.push({
          type: 'channel',
          priority: 'low',
          message: `Low reachability via: ${lowReachChannels.join(', ')}. Consider multi-channel strategy.`,
          suggestedAction: 'Enable fallback channels for users unreachable on primary',
        });
      }

      // Inactivity warning
      if (enrichment.lastActiveDistribution['60d_plus'] > 0.3) {
        this.suggestions.push({
          type: 'filter',
          priority: 'medium',
          message: `${(enrichment.lastActiveDistribution['60d_plus'] * 100).toFixed(0)}% of cohort inactive >60 days. These users have low engagement probability.`,
          suggestedAction: 'Consider filtering to users active within last 60 days',
        });
      }
    }

    this._log(`Generated ${this.suggestions.length} refinement suggestions`);
    this.emit('suggestionsGenerated', this.suggestions);
    return this.suggestions;
  }

  // ---- Main Execution ----

  async execute(filterDefinition, userPool = null) {
    this.emit('workflowStarted', { type: 'cohort_management' });

    try {
      await this.buildCohort(filterDefinition, userPool);
      const validationResult = await this.validate();
      await this.enrich();
      const suggestions = await this.suggestRefinements();

      this._transition(COHORT_STATES.COMPLETED);
      const summary = {
        cohortId: this.cohortId,
        size: this.cohort.matchedSize,
        validationPassed: validationResult.passed,
        blocked: validationResult.blocked,
        validationResults: this.validationResults,
        enrichment: this.enrichment,
        suggestions,
      };

      this._log('Cohort management workflow completed');
      this.emit('workflowCompleted', summary);
      return summary;
    } catch (error) {
      this._transition(COHORT_STATES.ERROR);
      this._log(`Error: ${error.message}`);
      this.emit('workflowError', error);
      throw error;
    }
  }
}

module.exports = { CohortManagementWorkflow, COHORT_STATES, SIZE_VERDICTS, OVERLAP_VERDICTS };
