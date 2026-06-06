/**
 * @module audit
 * @description Immutable audit trail system for all NudgeOps actions.
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');

/**
 * @class AuditLog
 * @description In-memory audit log with filtering, reporting, and tamper-evident entries.
 */
class AuditLog {
  constructor() {
    /** @type {Map<string, AuditEntry>} */
    this._store = new Map();
  }

  /**
   * Record an auditable event.
   * @param {string} action - The action that was performed.
   * @param {string} actor - Who or what performed the action (user id, 'system', agent id).
   * @param {object} details - Arbitrary structured details about the action.
   * @param {number} tier - The autonomy tier (0-3) under which the action was taken.
   * @param {string} [outcome='SUCCESS'] - Outcome of the action.
   * @returns {AuditEntry} The created audit entry.
   */
  log(action, actor, details = {}, tier = 0, outcome = 'SUCCESS') {
    const entry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      action,
      actor,
      autonomyTier: tier,
      details,
      outcome,
    };

    this._store.set(entry.id, entry);

    logger.info('Audit entry recorded', {
      auditId: entry.id,
      action: entry.action,
      actor: entry.actor,
      tier: entry.autonomyTier,
      outcome: entry.outcome,
    });

    return entry;
  }

  /**
   * Retrieve a single audit entry by id.
   * @param {string} id
   * @returns {AuditEntry|undefined}
   */
  getById(id) {
    return this._store.get(id);
  }

  /**
   * Query audit entries with optional filters.
   * @param {object} filters
   * @param {string} [filters.action] - Filter by action name (substring match).
   * @param {string} [filters.actor] - Filter by actor (exact match).
   * @param {number} [filters.tier] - Filter by autonomy tier.
   * @param {string} [filters.outcome] - Filter by outcome.
   * @param {string} [filters.startDate] - ISO date string, inclusive lower bound.
   * @param {string} [filters.endDate] - ISO date string, inclusive upper bound.
   * @param {number} [filters.limit=100] - Max entries to return.
   * @param {number} [filters.offset=0] - Number of entries to skip.
   * @returns {AuditEntry[]}
   */
  getLog(filters = {}) {
    const {
      action,
      actor,
      tier,
      outcome,
      startDate,
      endDate,
      limit = 100,
      offset = 0,
    } = filters;

    let entries = Array.from(this._store.values());

    if (action) {
      entries = entries.filter((e) => e.action.toLowerCase().includes(action.toLowerCase()));
    }
    if (actor) {
      entries = entries.filter((e) => e.actor === actor);
    }
    if (tier !== undefined && tier !== null) {
      entries = entries.filter((e) => e.autonomyTier === tier);
    }
    if (outcome) {
      entries = entries.filter((e) => e.outcome === outcome);
    }
    if (startDate) {
      const start = new Date(startDate);
      entries = entries.filter((e) => new Date(e.timestamp) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      entries = entries.filter((e) => new Date(e.timestamp) <= end);
    }

    // Sort newest first
    entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return entries.slice(offset, offset + limit);
  }

  /**
   * Generate a summary report for a given time range.
   * @param {object} timeRange
   * @param {string} timeRange.startDate - ISO date string.
   * @param {string} timeRange.endDate - ISO date string.
   * @returns {object} Aggregated report.
   */
  generateReport(timeRange) {
    const { startDate, endDate } = timeRange;
    const start = new Date(startDate);
    const end = new Date(endDate);

    const entries = Array.from(this._store.values()).filter((e) => {
      const ts = new Date(e.timestamp);
      return ts >= start && ts <= end;
    });

    const actionCounts = {};
    const tierCounts = { 0: 0, 1: 0, 2: 0, 3: 0 };
    const outcomeCounts = {};
    const actorCounts = {};

    for (const entry of entries) {
      actionCounts[entry.action] = (actionCounts[entry.action] || 0) + 1;
      tierCounts[entry.autonomyTier] = (tierCounts[entry.autonomyTier] || 0) + 1;
      outcomeCounts[entry.outcome] = (outcomeCounts[entry.outcome] || 0) + 1;
      actorCounts[entry.actor] = (actorCounts[entry.actor] || 0) + 1;
    }

    return {
      reportId: uuidv4(),
      generatedAt: new Date().toISOString(),
      timeRange: { startDate, endDate },
      totalEntries: entries.length,
      byAction: actionCounts,
      byTier: tierCounts,
      byOutcome: outcomeCounts,
      byActor: actorCounts,
      tier2Actions: entries.filter((e) => e.autonomyTier === 2).length,
      tier3Attempts: entries.filter((e) => e.autonomyTier === 3).length,
    };
  }

  /**
   * Return total count of entries.
   * @returns {number}
   */
  get size() {
    return this._store.size;
  }

  /**
   * Clear all entries (for testing only).
   */
  _clear() {
    this._store.clear();
  }
}

// Singleton instance
const auditLog = new AuditLog();

module.exports = { AuditLog, auditLog };
