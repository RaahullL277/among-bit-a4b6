import { useState, useEffect, useCallback, useRef } from 'react';

// ─── useNudgeOps ────────────────────────────────────────────────────────────
// Session initialization, command sending, status polling
export const useNudgeOps = () => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const initSession = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // TODO: Connect to backend API when ready
      // const res = await fetch('/api/nudgeops/session/init');
      // const data = await res.json();
      // setSession(data);

      const mockSession = {
        sessionId: 'ndg-sess-20260324-001',
        liveCampaigns: 7,
        pendingApprovals: 3,
        scheduledLaunches: 2,
        anomalies: 1,
        proactiveSuggestions: 4,
        greeting: 'Good morning. You have 7 live campaigns, 3 items awaiting approval, and 1 anomaly flagged.',
        alerts: [
          { id: 'a1', type: 'auto-action', severity: 'info', message: 'Auto-paused variant B of "Spring Re-engagement" — CTR dropped below 1% threshold.', timestamp: '2026-03-24T08:12:00Z' },
          { id: 'a2', type: 'auto-action', severity: 'warning', message: 'Throttled sending for "Onboarding Drip" — unsubscribe rate spiked to 0.8%.', timestamp: '2026-03-24T07:45:00Z' },
          { id: 'a3', type: 'anomaly', severity: 'critical', message: 'Delivery rate for "Win-back Q1" dropped to 72% — possible deliverability issue.', timestamp: '2026-03-24T06:30:00Z' },
        ],
      };

      await new Promise((r) => setTimeout(r, 800));
      setSession(mockSession);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, []);

  const sendCommand = useCallback(async (command) => {
    // TODO: POST /api/nudgeops/command
    console.log('[NudgeOps] sendCommand:', command);
    return { ok: true };
  }, []);

  useEffect(() => {
    initSession();
  }, [initSession]);

  return { session, loading, error, initSession, sendCommand };
};

// ─── useCampaigns ───────────────────────────────────────────────────────────
// CRUD operations for campaigns
export const useCampaigns = () => {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCampaigns = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // TODO: GET /api/campaigns
      const mockCampaigns = [
        {
          id: 'cmp-001',
          name: 'Spring Re-engagement',
          status: 'live',
          health: 'warning',
          channel: 'email',
          objective: 'Re-engage dormant users from Q4',
          cohortSize: 24500,
          startDate: '2026-03-18',
          metrics: { deliveryRate: 96.2, openRate: 22.4, ctr: 3.1, conversionRate: 1.8, unsubscribeRate: 0.12 },
          variants: [
            { id: 'A', name: 'Urgency', ctr: 3.8, conversion: 2.1, status: 'active' },
            { id: 'B', name: 'Benefit-led', ctr: 0.9, conversion: 0.4, status: 'paused' },
          ],
          autoActions: [
            { action: 'Paused variant B', reason: 'CTR below 1% threshold', timestamp: '2026-03-24T08:12:00Z' },
          ],
        },
        {
          id: 'cmp-002',
          name: 'Onboarding Drip v3',
          status: 'live',
          health: 'healthy',
          channel: 'push',
          objective: 'Guide new users through activation milestones',
          cohortSize: 8200,
          startDate: '2026-03-20',
          metrics: { deliveryRate: 99.1, openRate: 45.6, ctr: 12.3, conversionRate: 8.7, unsubscribeRate: 0.05 },
          variants: [
            { id: 'A', name: 'Milestone-based', ctr: 13.1, conversion: 9.2, status: 'active' },
            { id: 'B', name: 'Time-based', ctr: 11.5, conversion: 8.2, status: 'active' },
          ],
          autoActions: [],
        },
        {
          id: 'cmp-003',
          name: 'Win-back Q1',
          status: 'live',
          health: 'critical',
          channel: 'email',
          objective: 'Win back churned subscribers from January',
          cohortSize: 15800,
          startDate: '2026-03-15',
          metrics: { deliveryRate: 72.0, openRate: 8.3, ctr: 1.2, conversionRate: 0.3, unsubscribeRate: 0.45 },
          variants: [
            { id: 'A', name: 'Discount offer', ctr: 1.5, conversion: 0.4, status: 'active' },
            { id: 'B', name: 'Feature highlight', ctr: 0.9, conversion: 0.2, status: 'active' },
          ],
          autoActions: [
            { action: 'Flagged for review', reason: 'Delivery rate dropped below 80%', timestamp: '2026-03-24T06:30:00Z' },
          ],
        },
        {
          id: 'cmp-004',
          name: 'Feature Announcement - AI Tools',
          status: 'live',
          health: 'healthy',
          channel: 'in-app',
          objective: 'Drive adoption of new AI features',
          cohortSize: 42000,
          startDate: '2026-03-22',
          metrics: { deliveryRate: 100, openRate: 67.2, ctr: 28.4, conversionRate: 15.6, unsubscribeRate: 0.0 },
          variants: [
            { id: 'A', name: 'Banner + tooltip', ctr: 30.1, conversion: 16.8, status: 'active' },
            { id: 'B', name: 'Modal walkthrough', ctr: 26.7, conversion: 14.4, status: 'active' },
          ],
          autoActions: [],
        },
        {
          id: 'cmp-005',
          name: 'Upgrade Nudge - Pro Plan',
          status: 'live',
          health: 'healthy',
          channel: 'email',
          objective: 'Convert free-tier power users to Pro',
          cohortSize: 5600,
          startDate: '2026-03-21',
          metrics: { deliveryRate: 98.5, openRate: 34.1, ctr: 8.7, conversionRate: 4.2, unsubscribeRate: 0.08 },
          variants: [
            { id: 'A', name: 'Social proof', ctr: 9.3, conversion: 4.8, status: 'active' },
            { id: 'B', name: 'ROI calculator', ctr: 8.1, conversion: 3.6, status: 'active' },
          ],
          autoActions: [],
        },
        {
          id: 'cmp-006',
          name: 'Weekly Digest Optimization',
          status: 'live',
          health: 'healthy',
          channel: 'email',
          objective: 'Improve engagement with weekly digest emails',
          cohortSize: 89000,
          startDate: '2026-03-10',
          metrics: { deliveryRate: 97.8, openRate: 41.2, ctr: 6.5, conversionRate: 2.1, unsubscribeRate: 0.03 },
          variants: [
            { id: 'A', name: 'Personalized top-3', ctr: 7.2, conversion: 2.4, status: 'active' },
            { id: 'B', name: 'Category-based', ctr: 5.8, conversion: 1.8, status: 'active' },
          ],
          autoActions: [],
        },
        {
          id: 'cmp-007',
          name: 'Cart Abandonment Recovery',
          status: 'live',
          health: 'warning',
          channel: 'push',
          objective: 'Recover abandoned carts within 2-hour window',
          cohortSize: 3200,
          startDate: '2026-03-19',
          metrics: { deliveryRate: 94.5, openRate: 38.9, ctr: 15.2, conversionRate: 6.8, unsubscribeRate: 0.22 },
          variants: [
            { id: 'A', name: 'Scarcity', ctr: 16.8, conversion: 7.5, status: 'active' },
            { id: 'B', name: 'Helpful reminder', ctr: 13.6, conversion: 6.1, status: 'active' },
          ],
          autoActions: [
            { action: 'Reduced frequency', reason: 'Unsubscribe rate approaching 0.25% threshold', timestamp: '2026-03-23T14:20:00Z' },
          ],
        },
      ];

      await new Promise((r) => setTimeout(r, 600));
      setCampaigns(mockCampaigns);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, []);

  const createCampaign = useCallback(async (campaignData) => {
    // TODO: POST /api/campaigns
    console.log('[NudgeOps] createCampaign:', campaignData);
    return { ok: true, id: 'cmp-new-' + Date.now() };
  }, []);

  const updateCampaign = useCallback(async (id, updates) => {
    // TODO: PUT /api/campaigns/:id
    console.log('[NudgeOps] updateCampaign:', id, updates);
    return { ok: true };
  }, []);

  const deleteCampaign = useCallback(async (id) => {
    // TODO: DELETE /api/campaigns/:id
    console.log('[NudgeOps] deleteCampaign:', id);
    return { ok: true };
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  return { campaigns, loading, error, fetchCampaigns, createCampaign, updateCampaign, deleteCampaign };
};

// ─── useMonitoring ──────────────────────────────────────────────────────────
// Real-time monitoring data with polling
export const useMonitoring = (pollInterval = 30000) => {
  const [monitoringData, setMonitoringData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  const fetchMonitoring = useCallback(async () => {
    try {
      if (!monitoringData) setLoading(true);
      setError(null);

      // TODO: GET /api/monitoring/dashboard
      const mockData = {
        timestamp: new Date().toISOString(),
        overallHealth: 'warning',
        activeCampaigns: 7,
        totalNudgesSent: 187400,
        avgDeliveryRate: 94.0,
        avgOpenRate: 36.8,
        avgCtr: 10.8,
        avgConversion: 5.6,
        metricsOverTime: [
          { time: '06:00', deliveryRate: 95.2, openRate: 32.1, ctr: 9.5 },
          { time: '08:00', deliveryRate: 96.1, openRate: 38.4, ctr: 11.2 },
          { time: '10:00', deliveryRate: 94.8, openRate: 41.2, ctr: 12.8 },
          { time: '12:00', deliveryRate: 93.5, openRate: 39.7, ctr: 11.9 },
          { time: '14:00', deliveryRate: 92.1, openRate: 35.3, ctr: 10.1 },
          { time: '16:00', deliveryRate: 94.0, openRate: 36.8, ctr: 10.8 },
        ],
      };

      await new Promise((r) => setTimeout(r, 500));
      setMonitoringData(mockData);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, [monitoringData]);

  useEffect(() => {
    fetchMonitoring();
    intervalRef.current = setInterval(fetchMonitoring, pollInterval);
    return () => clearInterval(intervalRef.current);
  }, [pollInterval]); // eslint-disable-line react-hooks/exhaustive-deps

  return { monitoringData, loading, error, refetch: fetchMonitoring };
};

// ─── useApprovals ───────────────────────────────────────────────────────────
// Pending approvals management
export const useApprovals = () => {
  const [approvals, setApprovals] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchApprovals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // TODO: GET /api/approvals/pending
      const mockApprovals = [
        {
          id: 'apr-001',
          urgency: 'high',
          createdAt: '2026-03-24T07:00:00Z',
          what: 'Expand "Upgrade Nudge - Pro Plan" to include mid-tier users who hit usage limits 3+ times in the past 14 days.',
          who: '12,400 users matching extended cohort criteria (currently 5,600 in active campaign)',
          where: 'Email (primary) + In-app banner (secondary)',
          when: 'Begin March 25, 2026 at 10:00 AM UTC; run for 14 days',
          cost: 'Estimated 37,200 additional email sends (~$186 at current ESP rates)',
          projectedImpact: { conversions: '+520 Pro upgrades', revenue: '+$25,480 MRR', confidence: '72%' },
          risks: [
            { risk: 'Audience fatigue for users already receiving weekly digest', mitigation: 'Frequency cap: max 2 nudges/week per user' },
            { risk: 'Overlap with cart abandonment campaign (8% audience overlap)', mitigation: 'Suppress overlapping users for 48h after cart nudge' },
          ],
          compliance: { gdprConsent: true, ccpaOptOut: true, frequencyCap: true, quietHours: true, unsubscribeLink: true },
          recommendation: 'APPROVE — strong projected ROI with manageable risks. Recommend monitoring unsubscribe rate closely for first 48 hours.',
        },
        {
          id: 'apr-002',
          urgency: 'medium',
          createdAt: '2026-03-24T06:15:00Z',
          what: 'Launch new "Feature Adoption — Reporting" push notification campaign targeting users who have not used the reporting module.',
          who: '18,700 active users who logged in 5+ times but never accessed Reports',
          where: 'Push notification',
          when: 'Begin March 26, 2026; run for 7 days',
          cost: 'Estimated 56,100 push sends (~$28 at current rates)',
          projectedImpact: { conversions: '+3,740 report views', revenue: 'Indirect — improved retention', confidence: '65%' },
          risks: [
            { risk: 'Users may find push intrusive for feature they intentionally skip', mitigation: 'Single send with snooze option; exclude users who dismissed similar nudges' },
          ],
          compliance: { gdprConsent: true, ccpaOptOut: true, frequencyCap: true, quietHours: true, unsubscribeLink: true },
          recommendation: 'APPROVE — low cost, high potential for feature discovery. Suggest A/B testing copy variants.',
        },
        {
          id: 'apr-003',
          urgency: 'low',
          createdAt: '2026-03-24T05:30:00Z',
          what: 'Adjust send time for "Weekly Digest Optimization" from Tuesday 9 AM to Wednesday 10 AM based on engagement data.',
          who: '89,000 users in existing weekly digest campaign',
          where: 'Email',
          when: 'Apply starting next cycle (March 26)',
          cost: 'No additional cost — schedule change only',
          projectedImpact: { conversions: '+4.2% open rate improvement', revenue: 'Indirect', confidence: '81%' },
          risks: [
            { risk: 'Users accustomed to Tuesday delivery may be confused', mitigation: 'One-time "moved to Wednesday" notice in next digest' },
          ],
          compliance: { gdprConsent: true, ccpaOptOut: true, frequencyCap: true, quietHours: true, unsubscribeLink: true },
          recommendation: 'APPROVE — data-backed optimization with high confidence. Low risk.',
        },
      ];

      const mockHistory = [
        { id: 'apr-h1', what: 'Launched "Spring Re-engagement" campaign', decision: 'approved', decidedAt: '2026-03-17T14:30:00Z', decidedBy: 'Marketing Lead' },
        { id: 'apr-h2', what: 'Expanded "Onboarding Drip" to include churned reactivations', decision: 'approved_with_changes', decidedAt: '2026-03-19T11:00:00Z', decidedBy: 'Marketing Lead', changes: 'Reduced cohort to users churned < 30 days' },
        { id: 'apr-h3', what: 'SMS campaign for flash sale promotion', decision: 'rejected', decidedAt: '2026-03-20T09:15:00Z', decidedBy: 'Compliance Officer', reason: 'SMS consent not verified for 40% of cohort' },
      ];

      await new Promise((r) => setTimeout(r, 700));
      setApprovals(mockApprovals);
      setHistory(mockHistory);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, []);

  const approveAction = useCallback(async (id) => {
    // TODO: POST /api/approvals/:id/approve
    setApprovals((prev) => prev.filter((a) => a.id !== id));
    return { ok: true };
  }, []);

  const approveWithChanges = useCallback(async (id, changes) => {
    // TODO: POST /api/approvals/:id/approve-with-changes
    setApprovals((prev) => prev.filter((a) => a.id !== id));
    return { ok: true };
  }, []);

  const rejectAction = useCallback(async (id, reason) => {
    // TODO: POST /api/approvals/:id/reject
    setApprovals((prev) => prev.filter((a) => a.id !== id));
    return { ok: true };
  }, []);

  const deferAction = useCallback(async (id) => {
    // TODO: POST /api/approvals/:id/defer
    return { ok: true };
  }, []);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  return { approvals, history, loading, error, fetchApprovals, approveAction, approveWithChanges, rejectAction, deferAction };
};

// ─── useAnalytics ───────────────────────────────────────────────────────────
// Analytics data fetching
export const useAnalytics = () => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // TODO: GET /api/analytics/overview
      const mockAnalytics = {
        overview: {
          totalCampaigns: 23,
          totalNudgesSent: 1_245_800,
          avgCtr: 8.4,
          avgConversion: 4.1,
        },
        campaignPerformance: [
          { name: 'Feature Announcement - AI Tools', channel: 'in-app', nudgesSent: 42000, openRate: 67.2, ctr: 28.4, conversion: 15.6, status: 'live' },
          { name: 'Onboarding Drip v3', channel: 'push', nudgesSent: 8200, openRate: 45.6, ctr: 12.3, conversion: 8.7, status: 'live' },
          { name: 'Cart Abandonment Recovery', channel: 'push', nudgesSent: 3200, openRate: 38.9, ctr: 15.2, conversion: 6.8, status: 'live' },
          { name: 'Upgrade Nudge - Pro Plan', channel: 'email', nudgesSent: 5600, openRate: 34.1, ctr: 8.7, conversion: 4.2, status: 'live' },
          { name: 'Weekly Digest Optimization', channel: 'email', nudgesSent: 89000, openRate: 41.2, ctr: 6.5, conversion: 2.1, status: 'live' },
          { name: 'Spring Re-engagement', channel: 'email', nudgesSent: 24500, openRate: 22.4, ctr: 3.1, conversion: 1.8, status: 'live' },
          { name: 'Win-back Q1', channel: 'email', nudgesSent: 15800, openRate: 8.3, ctr: 1.2, conversion: 0.3, status: 'live' },
        ],
        trends: [
          { week: 'W9', campaigns: 4, ctr: 7.2, conversion: 3.5 },
          { week: 'W10', campaigns: 5, ctr: 7.8, conversion: 3.8 },
          { week: 'W11', campaigns: 6, ctr: 8.1, conversion: 4.0 },
          { week: 'W12', campaigns: 7, ctr: 8.4, conversion: 4.1 },
        ],
        learningInsights: [
          { type: 'copy', title: 'Urgency-framed CTAs outperform benefit-framed by 42%', detail: 'Across 8 campaigns, copy variants using urgency language ("Don\'t miss out", "Limited time") averaged 11.2% CTR vs 7.9% for benefit-led variants.' },
          { type: 'channel', title: 'In-app nudges convert 3.2x better than email for feature adoption', detail: 'Feature announcement campaigns via in-app messaging show 15.6% conversion vs 4.8% for equivalent email campaigns.' },
          { type: 'cohort', title: 'Users active 3-5 days/week are 2.1x more likely to convert on upgrade nudges', detail: 'Mid-frequency users show strongest upgrade intent. Low-frequency users ignore; high-frequency users already converted.' },
          { type: 'timing', title: 'Wednesday 10-11 AM UTC is the optimal send window for email campaigns', detail: 'Analysis of 1.2M sends shows 18% higher open rates for Wednesday mid-morning vs other time slots.' },
        ],
        proactiveOpportunities: [
          { id: 'opp-1', title: 'Reactivation opportunity: 4,200 users inactive 14-21 days', description: 'Window is closing — users inactive beyond 21 days have <5% reactivation rate. Recommend push + email combo.', estimatedImpact: '+840 reactivated users' },
          { id: 'opp-2', title: 'Cross-sell: 6,100 Pro users never tried Team features', description: 'High-value segment with 3.4x average LTV. Recommend in-app walkthrough of Team collaboration tools.', estimatedImpact: '+$18,300 MRR from Team upgrades' },
          { id: 'opp-3', title: 'Seasonal trend: tax season workflow templates', description: 'Search volume for "tax templates" up 340% this week. Quick campaign targeting accountant segment.', estimatedImpact: '+2,100 template activations' },
        ],
      };

      await new Promise((r) => setTimeout(r, 900));
      setAnalytics(mockAnalytics);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return { analytics, loading, error, refetch: fetchAnalytics };
};

export default useNudgeOps;
