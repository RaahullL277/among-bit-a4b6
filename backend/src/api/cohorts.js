/**
 * @module api/cohorts
 * @description Express router for cohort management endpoints.
 */

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { auditLog } = require('../utils/audit');
const { UserProfileService, FrequencyCapService } = require('../services/upstream-services');

const router = express.Router();

// ---------------------------------------------------------------------------
// In-memory cohort store
// ---------------------------------------------------------------------------

const cohorts = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
  }
  return null;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ---------------------------------------------------------------------------
// POST /api/cohorts/build - Build cohort from filter criteria
// ---------------------------------------------------------------------------

router.post(
  '/build',
  [
    body('name').isString().trim().notEmpty().withMessage('Cohort name is required'),
    body('filters').isObject().withMessage('Filters object is required'),
    body('filters.segments').optional().isArray(),
    body('filters.cities').optional().isArray(),
    body('filters.ageRange').optional().isObject(),
    body('filters.categories').optional().isArray(),
    body('filters.minPurchases').optional().isInt({ min: 0 }),
    body('filters.lastActiveDays').optional().isInt({ min: 1 }),
    body('filters.channels').optional().isArray(),
  ],
  async (req, res) => {
    const validationError = handleValidation(req, res);
    if (validationError) return validationError;

    try {
      const { name, filters } = req.body;
      const cohortId = `coh_${uuidv4().slice(0, 8)}`;
      const now = new Date().toISOString();

      // Simulate cohort building based on filters
      let estimatedSize = randomInt(5000, 500000);

      // Narrow down based on filters provided
      if (filters.segments && filters.segments.length > 0) {
        estimatedSize = Math.round(estimatedSize * (filters.segments.length / 6));
      }
      if (filters.cities && filters.cities.length > 0) {
        estimatedSize = Math.round(estimatedSize * (filters.cities.length / 8));
      }
      if (filters.ageRange) {
        const range = (filters.ageRange.max || 65) - (filters.ageRange.min || 18);
        estimatedSize = Math.round(estimatedSize * (range / 47));
      }

      // Generate sample user IDs
      const sampleUserIds = Array.from({ length: Math.min(10, estimatedSize) }, () => uuidv4());

      const cohort = {
        id: cohortId,
        name,
        filters,
        estimatedSize,
        actualSize: null,
        status: 'building',
        sampleUserIds,
        demographics: {
          avgAge: randomInt(22, 45),
          genderDistribution: { male: randomInt(40, 60), female: randomInt(30, 50), non_binary: randomInt(2, 10) },
          topCities: ['Bangalore', 'Mumbai', 'Delhi', 'Hyderabad', 'Chennai'].slice(0, randomInt(3, 5)),
          topSegments: (filters.segments || ['high_value', 'deal_seeker']).slice(0, 3),
        },
        createdAt: now,
        updatedAt: now,
      };

      // Simulate build completion
      cohort.actualSize = estimatedSize + randomInt(-500, 500);
      if (cohort.actualSize < 0) cohort.actualSize = estimatedSize;
      cohort.status = 'ready';

      cohorts.set(cohortId, cohort);

      auditLog.log('cohort.built', 'system', {
        cohortId,
        name,
        size: cohort.actualSize,
        filterCount: Object.keys(filters).length,
      }, 1);

      logger.info('Cohort built', { cohortId, size: cohort.actualSize });

      res.status(201).json({ success: true, data: cohort });
    } catch (err) {
      logger.error('Error building cohort', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/cohorts/validate - Validate cohort
// ---------------------------------------------------------------------------

router.post(
  '/validate',
  [
    body('cohortId').isString().trim().notEmpty().withMessage('Cohort ID is required'),
    body('channel').optional().isString().trim(),
    body('campaignId').optional().isString().trim(),
  ],
  async (req, res) => {
    const validationError = handleValidation(req, res);
    if (validationError) return validationError;

    try {
      const { cohortId, channel, campaignId } = req.body;
      const cohort = cohorts.get(cohortId);

      if (!cohort) {
        return res.status(404).json({ success: false, error: 'Cohort not found' });
      }

      const size = cohort.actualSize || cohort.estimatedSize;

      // Size validation
      const sizeValidation = {
        check: 'size',
        passed: size >= 100 && size <= 5000000,
        details: {
          cohortSize: size,
          minAllowed: 100,
          maxAllowed: 5000000,
          message: size < 100
            ? 'Cohort too small for meaningful campaign'
            : size > 5000000
              ? 'Cohort exceeds maximum allowed size'
              : 'Cohort size within acceptable range',
        },
      };

      // Overlap validation
      const overlapPercentage = +(Math.random() * 20).toFixed(1);
      const overlapValidation = {
        check: 'overlap',
        passed: overlapPercentage < 30,
        details: {
          overlappingCampaigns: randomInt(0, 3),
          overlapPercentage,
          maxAllowedOverlap: 30,
          message: overlapPercentage >= 30
            ? 'High overlap with existing campaigns detected'
            : 'Overlap within acceptable limits',
        },
      };

      // Fatigue validation
      const fatigueScore = +(Math.random() * 100).toFixed(1);
      const fatigueValidation = {
        check: 'fatigue',
        passed: fatigueScore < 70,
        details: {
          fatigueScore,
          maxAllowed: 70,
          avgNudgesLast7Days: +(Math.random() * 5).toFixed(1),
          usersAtCapacity: randomInt(0, Math.round(size * 0.1)),
          message: fatigueScore >= 70
            ? 'High fatigue risk detected in this cohort'
            : 'Fatigue levels acceptable',
        },
      };

      // Diversity validation
      const diversityScore = +(Math.random() * 40 + 60).toFixed(1);
      const diversityValidation = {
        check: 'diversity',
        passed: diversityScore > 50,
        details: {
          diversityScore,
          minRequired: 50,
          segmentDistribution: {
            high_value: randomInt(10, 30),
            deal_seeker: randomInt(15, 35),
            new_user: randomInt(5, 20),
            loyal: randomInt(10, 25),
            other: randomInt(5, 15),
          },
          message: diversityScore <= 50
            ? 'Cohort lacks diversity, may indicate filter bias'
            : 'Good diversity across segments',
        },
      };

      const validations = [sizeValidation, overlapValidation, fatigueValidation, diversityValidation];
      const allPassed = validations.every((v) => v.passed);

      const result = {
        cohortId,
        campaignId: campaignId || null,
        channel: channel || null,
        overallValid: allPassed,
        validations,
        recommendations: [],
        validatedAt: new Date().toISOString(),
      };

      if (!sizeValidation.passed) {
        result.recommendations.push('Adjust filters to bring cohort size within 100 - 5,000,000 range');
      }
      if (!overlapValidation.passed) {
        result.recommendations.push('Consider excluding users already targeted by active campaigns');
      }
      if (!fatigueValidation.passed) {
        result.recommendations.push('Reduce cohort or delay campaign to allow fatigue recovery');
      }
      if (!diversityValidation.passed) {
        result.recommendations.push('Broaden filter criteria to improve cohort diversity');
      }

      auditLog.log('cohort.validated', 'system', { cohortId, valid: allPassed }, 1);

      res.json({ success: true, data: result });
    } catch (err) {
      logger.error('Error validating cohort', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/cohorts/:id/metadata - Get enriched cohort metadata
// ---------------------------------------------------------------------------

router.get(
  '/:id/metadata',
  [param('id').isString().trim().notEmpty()],
  async (req, res) => {
    const validationError = handleValidation(req, res);
    if (validationError) return validationError;

    try {
      const cohort = cohorts.get(req.params.id);
      if (!cohort) {
        return res.status(404).json({ success: false, error: 'Cohort not found' });
      }

      // Enrich with upstream data for sample users
      let sampleProfiles = [];
      if (cohort.sampleUserIds && cohort.sampleUserIds.length > 0) {
        sampleProfiles = await UserProfileService.getBulkProfiles(cohort.sampleUserIds.slice(0, 5));
      }

      const metadata = {
        cohortId: cohort.id,
        name: cohort.name,
        status: cohort.status,
        size: cohort.actualSize || cohort.estimatedSize,
        filters: cohort.filters,
        demographics: cohort.demographics,
        enrichment: {
          avgLifetimeValue: randomInt(2000, 50000),
          avgOrderFrequency: +(Math.random() * 3 + 0.5).toFixed(1),
          channelPreferences: {
            push: randomInt(20, 40),
            email: randomInt(15, 35),
            sms: randomInt(10, 25),
            whatsapp: randomInt(5, 20),
            in_app: randomInt(10, 20),
          },
          behaviorInsights: {
            avgSessionsPerWeek: +(Math.random() * 5 + 1).toFixed(1),
            topBrowsedCategories: ['electronics', 'fashion', 'grocery'].slice(0, randomInt(2, 3)),
            avgCartAbandonRate: +(Math.random() * 30 + 10).toFixed(1),
            peakActivityHour: randomInt(9, 22),
          },
          sampleProfiles: sampleProfiles.slice(0, 3),
        },
        createdAt: cohort.createdAt,
        updatedAt: cohort.updatedAt,
      };

      res.json({ success: true, data: metadata });
    } catch (err) {
      logger.error('Error fetching cohort metadata', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/cohorts/:id/refine - Get refinement suggestions
// ---------------------------------------------------------------------------

router.post(
  '/:id/refine',
  [
    param('id').isString().trim().notEmpty(),
    body('objective').optional().isString().trim(),
    body('targetSize').optional().isInt({ min: 100 }),
    body('constraints').optional().isObject(),
  ],
  async (req, res) => {
    const validationError = handleValidation(req, res);
    if (validationError) return validationError;

    try {
      const cohort = cohorts.get(req.params.id);
      if (!cohort) {
        return res.status(404).json({ success: false, error: 'Cohort not found' });
      }

      const { objective, targetSize, constraints } = req.body;
      const currentSize = cohort.actualSize || cohort.estimatedSize;

      const suggestions = [];

      // Generate context-aware suggestions
      if (targetSize && targetSize < currentSize) {
        suggestions.push({
          type: 'narrow',
          action: 'Add segment filter',
          description: 'Restrict to high_value segment to reduce size and improve conversion likelihood',
          estimatedImpact: { newSize: Math.round(currentSize * 0.4), conversionLift: '+15%' },
          priority: 'high',
        });
        suggestions.push({
          type: 'narrow',
          action: 'Add recency filter',
          description: 'Include only users active in the last 7 days for higher engagement',
          estimatedImpact: { newSize: Math.round(currentSize * 0.6), engagementLift: '+22%' },
          priority: 'medium',
        });
      }

      if (targetSize && targetSize > currentSize) {
        suggestions.push({
          type: 'expand',
          action: 'Relax age range',
          description: 'Expand age range to 18-55 to include more eligible users',
          estimatedImpact: { newSize: Math.round(currentSize * 1.4) },
          priority: 'medium',
        });
        suggestions.push({
          type: 'expand',
          action: 'Add lookalike segment',
          description: 'Include users similar to current cohort based on behaviour vectors',
          estimatedImpact: { newSize: Math.round(currentSize * 1.8), qualityScore: 0.72 },
          priority: 'high',
        });
      }

      // Always suggest fatigue-based refinement
      suggestions.push({
        type: 'optimize',
        action: 'Exclude fatigued users',
        description: 'Remove users who received 3+ nudges in the last 48 hours',
        estimatedImpact: { usersRemoved: randomInt(500, 5000), deliverabilityLift: '+8%' },
        priority: 'high',
      });

      // DND exclusion
      suggestions.push({
        type: 'compliance',
        action: 'Exclude DND-registered numbers',
        description: 'Remove users on the DND registry to ensure regulatory compliance',
        estimatedImpact: { usersRemoved: randomInt(100, 2000) },
        priority: 'critical',
      });

      if (objective) {
        suggestions.push({
          type: 'objective_aligned',
          action: `Optimize for ${objective}`,
          description: `Re-rank cohort members by predicted ${objective} probability`,
          estimatedImpact: { expectedLift: `+${randomInt(5, 25)}%` },
          priority: 'high',
        });
      }

      const result = {
        cohortId: cohort.id,
        currentSize,
        targetSize: targetSize || null,
        objective: objective || null,
        suggestions,
        generatedAt: new Date().toISOString(),
      };

      auditLog.log('cohort.refinement_requested', 'system', { cohortId: cohort.id }, 0);

      res.json({ success: true, data: result });
    } catch (err) {
      logger.error('Error generating cohort refinements', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

module.exports = router;
