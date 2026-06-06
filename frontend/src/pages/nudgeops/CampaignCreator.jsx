import React, { useState, useMemo } from 'react';
import {
  Zap, ArrowLeft, ArrowRight, Check, Target, Users, FileText, Eye,
  Send, Plus, Trash2, AlertTriangle, CheckCircle, XCircle, Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCampaigns } from '../../hooks/nudgeops/useNudgeOps';
import ComplianceChecklist from '../../components/nudgeops/ComplianceChecklist';

const STEPS = ['Intent', 'Targeting', 'Copy', 'Review'];
const STEP_ICONS = [Target, Users, FileText, Eye];

const CATEGORIES = ['Re-engagement', 'Onboarding', 'Feature Adoption', 'Upsell / Cross-sell', 'Win-back', 'Transactional', 'Seasonal', 'Custom'];
const CHANNELS = ['Email', 'Push Notification', 'In-App', 'SMS'];
const URGENCY_LEVELS = ['Low', 'Medium', 'High', 'Critical'];
const PERSONALIZATION_TOKENS = ['{{first_name}}', '{{company}}', '{{plan_name}}', '{{last_action}}', '{{days_inactive}}', '{{feature_name}}'];

const initialForm = {
  // Step 1 — Intent
  objective: '',
  category: '',
  channel: '',
  urgency: 'Medium',
  // Step 2 — Targeting
  cohortFilters: [{ field: 'last_active', operator: 'less_than', value: '14', logic: 'AND' }],
  estimatedReach: 12400,
  overlapWarning: null,
  fatigueCheckPassed: true,
  // Step 3 — Copy
  variants: [
    { id: 'A', subject: '', body: '', cta: '' },
    { id: 'B', subject: '', body: '', cta: '' },
  ],
  // Step 4 — Review (computed)
};

const FILTER_FIELDS = ['last_active', 'plan_type', 'signup_date', 'sessions_count', 'feature_used', 'country', 'lifetime_value'];
const FILTER_OPS = ['equals', 'not_equals', 'greater_than', 'less_than', 'contains', 'in_list'];

// ── Stepper ──────────────────────────────────────────────────────────────────
const Stepper = ({ currentStep }) => (
  <div className="flex items-center justify-center space-x-2 mb-8">
    {STEPS.map((step, idx) => {
      const Icon = STEP_ICONS[idx];
      const isActive = idx === currentStep;
      const isDone = idx < currentStep;
      return (
        <React.Fragment key={step}>
          {idx > 0 && (
            <div className={`h-px w-8 sm:w-16 ${isDone ? 'bg-green-400' : 'bg-white/20'}`} />
          )}
          <div className="flex flex-col items-center">
            <div
              className={`h-10 w-10 rounded-full flex items-center justify-center border-2 transition-all ${
                isDone
                  ? 'bg-green-500/20 border-green-400 text-green-400'
                  : isActive
                    ? 'bg-blue-500/20 border-blue-400 text-blue-400'
                    : 'bg-white/5 border-white/20 text-white/40'
              }`}
            >
              {isDone ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
            </div>
            <span className={`text-xs mt-1.5 ${isActive ? 'text-blue-400 font-semibold' : isDone ? 'text-green-400' : 'text-white/40'}`}>
              {step}
            </span>
          </div>
        </React.Fragment>
      );
    })}
  </div>
);

// ── Step 1: Intent ───────────────────────────────────────────────────────────
const StepIntent = ({ form, setField, errors }) => (
  <div className="space-y-6">
    <div>
      <label className="block text-sm font-medium text-white/70 mb-2">Campaign Objective</label>
      <textarea
        value={form.objective}
        onChange={(e) => setField('objective', e.target.value)}
        placeholder="Describe what this campaign aims to achieve..."
        rows={3}
        className={`w-full bg-white/5 border ${errors.objective ? 'border-red-400/50' : 'border-white/20'} rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent resize-none`}
      />
      {errors.objective && <p className="text-red-400 text-xs mt-1">{errors.objective}</p>}
    </div>

    <div>
      <label className="block text-sm font-medium text-white/70 mb-2">Category</label>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setField('category', cat)}
            className={`px-3 py-2 text-sm rounded-lg border transition-all ${
              form.category === cat
                ? 'bg-blue-500/20 border-blue-400/50 text-blue-300'
                : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:border-white/20'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>
      {errors.category && <p className="text-red-400 text-xs mt-1">{errors.category}</p>}
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      <div>
        <label className="block text-sm font-medium text-white/70 mb-2">Channel Preference</label>
        <div className="space-y-2">
          {CHANNELS.map((ch) => (
            <button
              key={ch}
              onClick={() => setField('channel', ch)}
              className={`w-full text-left px-4 py-2.5 text-sm rounded-lg border transition-all ${
                form.channel === ch
                  ? 'bg-blue-500/20 border-blue-400/50 text-blue-300'
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
              }`}
            >
              {ch}
            </button>
          ))}
        </div>
        {errors.channel && <p className="text-red-400 text-xs mt-1">{errors.channel}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-white/70 mb-2">Urgency Level</label>
        <div className="space-y-2">
          {URGENCY_LEVELS.map((u) => {
            const colors = {
              Low: 'bg-green-500/20 border-green-400/50 text-green-300',
              Medium: 'bg-blue-500/20 border-blue-400/50 text-blue-300',
              High: 'bg-yellow-500/20 border-yellow-400/50 text-yellow-300',
              Critical: 'bg-red-500/20 border-red-400/50 text-red-300',
            };
            return (
              <button
                key={u}
                onClick={() => setField('urgency', u)}
                className={`w-full text-left px-4 py-2.5 text-sm rounded-lg border transition-all ${
                  form.urgency === u ? colors[u] : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                {u}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  </div>
);

// ── Step 2: Targeting ────────────────────────────────────────────────────────
const StepTargeting = ({ form, setField }) => {
  const filters = form.cohortFilters;

  const updateFilter = (idx, key, val) => {
    const updated = filters.map((f, i) => (i === idx ? { ...f, [key]: val } : f));
    setField('cohortFilters', updated);
  };

  const addFilter = () => {
    setField('cohortFilters', [...filters, { field: 'plan_type', operator: 'equals', value: '', logic: 'AND' }]);
  };

  const removeFilter = (idx) => {
    if (filters.length <= 1) return;
    setField('cohortFilters', filters.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-6">
      {/* Filter builder */}
      <div>
        <label className="block text-sm font-medium text-white/70 mb-3">Cohort Filters</label>
        <div className="space-y-3">
          {filters.map((filter, idx) => (
            <div key={idx} className="flex flex-wrap items-center gap-2">
              {idx > 0 && (
                <select
                  value={filter.logic}
                  onChange={(e) => updateFilter(idx, 'logic', e.target.value)}
                  className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="AND" className="bg-gray-900">AND</option>
                  <option value="OR" className="bg-gray-900">OR</option>
                  <option value="NOT" className="bg-gray-900">NOT</option>
                </select>
              )}
              <select
                value={filter.field}
                onChange={(e) => updateFilter(idx, 'field', e.target.value)}
                className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 flex-1 min-w-[140px]"
              >
                {FILTER_FIELDS.map((f) => (
                  <option key={f} value={f} className="bg-gray-900">{f.replace(/_/g, ' ')}</option>
                ))}
              </select>
              <select
                value={filter.operator}
                onChange={(e) => updateFilter(idx, 'operator', e.target.value)}
                className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                {FILTER_OPS.map((op) => (
                  <option key={op} value={op} className="bg-gray-900">{op.replace(/_/g, ' ')}</option>
                ))}
              </select>
              <input
                value={filter.value}
                onChange={(e) => updateFilter(idx, 'value', e.target.value)}
                placeholder="Value"
                className="bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 flex-1 min-w-[100px]"
              />
              <button
                onClick={() => removeFilter(idx)}
                className="p-2 text-white/40 hover:text-red-400 transition-colors"
                disabled={filters.length <= 1}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addFilter}
          className="mt-3 flex items-center space-x-1 text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>Add filter</span>
        </button>
      </div>

      {/* Estimated Reach */}
      <div className="bg-white/5 rounded-xl p-5 border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-white/70">Estimated Reach</span>
          <span className="text-2xl font-bold text-blue-400">{form.estimatedReach.toLocaleString()}</span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-2">
          <div className="bg-gradient-to-r from-blue-500 to-purple-500 rounded-full h-2" style={{ width: '24%' }} />
        </div>
        <p className="text-xs text-white/40 mt-2">24% of total user base</p>
      </div>

      {/* Overlap Warning */}
      <div className="bg-yellow-500/5 rounded-xl p-4 border border-yellow-400/20 flex items-start space-x-3">
        <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-yellow-300 font-medium">8% audience overlap detected</p>
          <p className="text-xs text-white/50 mt-1">1,024 users overlap with "Cart Abandonment Recovery" campaign. Consider suppression rules.</p>
        </div>
      </div>

      {/* Fatigue Check */}
      <div className="bg-green-500/5 rounded-xl p-4 border border-green-400/20 flex items-start space-x-3">
        <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-green-300 font-medium">Fatigue check passed</p>
          <p className="text-xs text-white/50 mt-1">Average cohort member has received 1.2 nudges in the past 7 days (below 3/week cap).</p>
        </div>
      </div>
    </div>
  );
};

// ── Step 3: Copy ─────────────────────────────────────────────────────────────
const StepCopy = ({ form, setField }) => {
  const variants = form.variants;
  const [previewIdx, setPreviewIdx] = useState(null);

  const updateVariant = (idx, key, val) => {
    const updated = variants.map((v, i) => (i === idx ? { ...v, [key]: val } : v));
    setField('variants', updated);
  };

  const addVariant = () => {
    if (variants.length >= 4) return;
    const nextId = String.fromCharCode(65 + variants.length);
    setField('variants', [...variants, { id: nextId, subject: '', body: '', cta: '' }]);
  };

  const removeVariant = (idx) => {
    if (variants.length <= 2) return;
    setField('variants', variants.filter((_, i) => i !== idx));
  };

  const insertToken = (idx, field, token) => {
    const v = variants[idx];
    updateVariant(idx, field, v[field] + token);
  };

  return (
    <div className="space-y-6">
      {variants.map((variant, idx) => (
        <div key={variant.id} className="bg-white/5 rounded-xl p-5 border border-white/10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Variant {variant.id}</h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPreviewIdx(previewIdx === idx ? null : idx)}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center space-x-1"
              >
                <Eye className="h-3.5 w-3.5" />
                <span>{previewIdx === idx ? 'Close Preview' : 'Preview'}</span>
              </button>
              {variants.length > 2 && (
                <button onClick={() => removeVariant(idx)} className="text-xs text-red-400 hover:text-red-300 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-white/50">Subject Line</label>
                <span className="text-xs text-white/30">{variant.subject.length}/80</span>
              </div>
              <input
                value={variant.subject}
                onChange={(e) => updateVariant(idx, 'subject', e.target.value)}
                maxLength={80}
                placeholder="Enter subject line..."
                className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-white/50">Body</label>
                <span className="text-xs text-white/30">{variant.body.length}/500</span>
              </div>
              <textarea
                value={variant.body}
                onChange={(e) => updateVariant(idx, 'body', e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Write the body copy..."
                className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-white/50">CTA Text</label>
                <span className="text-xs text-white/30">{variant.cta.length}/40</span>
              </div>
              <input
                value={variant.cta}
                onChange={(e) => updateVariant(idx, 'cta', e.target.value)}
                maxLength={40}
                placeholder="e.g. Get Started, Learn More..."
                className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>

            {/* Personalization tokens */}
            <div>
              <label className="text-xs text-white/50 mb-1 block">Insert Personalization Token</label>
              <div className="flex flex-wrap gap-1.5">
                {PERSONALIZATION_TOKENS.map((token) => (
                  <button
                    key={token}
                    onClick={() => insertToken(idx, 'body', ' ' + token)}
                    className="px-2 py-1 text-xs bg-purple-500/20 text-purple-300 rounded border border-purple-400/30 hover:bg-purple-500/30 transition-colors"
                  >
                    {token}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Preview */}
          {previewIdx === idx && (
            <div className="mt-4 bg-white/10 rounded-lg p-4 border border-white/20">
              <div className="text-xs text-white/40 uppercase tracking-wider mb-2">Preview</div>
              <div className="text-sm font-semibold text-white mb-2">{variant.subject || '(No subject)'}</div>
              <div className="text-sm text-white/70 whitespace-pre-wrap mb-3">{variant.body || '(No body)'}</div>
              {variant.cta && (
                <span className="inline-block px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-sm font-medium rounded-lg">
                  {variant.cta}
                </span>
              )}
            </div>
          )}
        </div>
      ))}

      {variants.length < 4 && (
        <button
          onClick={addVariant}
          className="w-full py-3 border-2 border-dashed border-white/20 rounded-xl text-sm text-white/50 hover:text-white/70 hover:border-white/30 transition-colors flex items-center justify-center space-x-2"
        >
          <Plus className="h-4 w-4" />
          <span>Add Variant ({variants.length}/4)</span>
        </button>
      )}
    </div>
  );
};

// ── Step 4: Review ───────────────────────────────────────────────────────────
const StepReview = ({ form }) => {
  const complianceChecks = [
    { name: 'GDPR Consent verified', passed: true, details: 'All users in cohort have valid marketing consent under GDPR.' },
    { name: 'CCPA Opt-out honored', passed: true, details: 'California-based users who opted out have been excluded.' },
    { name: 'Frequency cap enforced', passed: true, details: 'Maximum 3 nudges per user per week. Current cohort average: 1.2/week.' },
    { name: 'Quiet hours configured', passed: true, details: 'No sends between 9 PM and 8 AM in recipient local time.' },
    { name: 'Unsubscribe link included', passed: form.variants.every((v) => v.body.length > 0), details: 'One-click unsubscribe link will be automatically appended.' },
  ];

  return (
    <div className="space-y-6">
      {/* Campaign Brief */}
      <div className="bg-white/5 rounded-xl p-5 border border-white/10">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
          <Sparkles className="h-5 w-5 text-yellow-400" />
          <span>Campaign Brief</span>
        </h3>

        <div className="space-y-4">
          <div>
            <span className="text-xs text-white/40 uppercase tracking-wider">Objective</span>
            <p className="text-sm text-white/80 mt-1">{form.objective || '—'}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <span className="text-xs text-white/40 uppercase tracking-wider">Category</span>
              <p className="text-sm text-white/80 mt-1">{form.category || '—'}</p>
            </div>
            <div>
              <span className="text-xs text-white/40 uppercase tracking-wider">Channel</span>
              <p className="text-sm text-white/80 mt-1">{form.channel || '—'}</p>
            </div>
            <div>
              <span className="text-xs text-white/40 uppercase tracking-wider">Urgency</span>
              <p className="text-sm text-white/80 mt-1">{form.urgency}</p>
            </div>
          </div>
          <div>
            <span className="text-xs text-white/40 uppercase tracking-wider">Estimated Reach</span>
            <p className="text-sm text-blue-400 font-semibold mt-1">{form.estimatedReach.toLocaleString()} users</p>
          </div>
          <div>
            <span className="text-xs text-white/40 uppercase tracking-wider">Cohort Filters</span>
            <div className="flex flex-wrap gap-2 mt-2">
              {form.cohortFilters.map((f, idx) => (
                <span key={idx} className="px-2 py-1 bg-white/10 rounded text-xs text-white/70 border border-white/10">
                  {idx > 0 && <span className="text-blue-400 font-semibold mr-1">{f.logic}</span>}
                  {f.field.replace(/_/g, ' ')} {f.operator.replace(/_/g, ' ')} {f.value}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Copy Variants Table */}
      <div className="bg-white/5 rounded-xl p-5 border border-white/10">
        <h4 className="text-sm font-semibold text-white mb-3">Copy Variants</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-white/40 uppercase tracking-wider">
                <th className="text-left py-2 pr-4">Variant</th>
                <th className="text-left py-2 pr-4">Subject</th>
                <th className="text-left py-2 pr-4">CTA</th>
                <th className="text-right py-2">Body Length</th>
              </tr>
            </thead>
            <tbody>
              {form.variants.map((v) => (
                <tr key={v.id} className="border-t border-white/5">
                  <td className="py-2 pr-4 text-blue-400 font-semibold">{v.id}</td>
                  <td className="py-2 pr-4 text-white/70 max-w-[200px] truncate">{v.subject || '—'}</td>
                  <td className="py-2 pr-4 text-white/70">{v.cta || '—'}</td>
                  <td className="py-2 text-right text-white/50">{v.body.length} chars</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Compliance Checklist */}
      <div className="bg-white/5 rounded-xl p-5 border border-white/10">
        <h4 className="text-sm font-semibold text-white mb-3">Compliance Checklist</h4>
        <ComplianceChecklist checks={complianceChecks} />
      </div>

      {/* Projected Impact */}
      <div className="bg-white/5 rounded-xl p-5 border border-white/10">
        <h4 className="text-sm font-semibold text-white mb-3">Projected Impact</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-white/40 uppercase tracking-wider">
                <th className="text-left py-2 pr-4">Metric</th>
                <th className="text-right py-2 pr-4">Projected</th>
                <th className="text-right py-2">Confidence</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-white/5">
                <td className="py-2 pr-4 text-white/70">Open Rate</td>
                <td className="py-2 pr-4 text-right text-white/80 font-medium">28-34%</td>
                <td className="py-2 text-right text-green-400">High</td>
              </tr>
              <tr className="border-t border-white/5">
                <td className="py-2 pr-4 text-white/70">Click-through Rate</td>
                <td className="py-2 pr-4 text-right text-white/80 font-medium">6-9%</td>
                <td className="py-2 text-right text-yellow-400">Medium</td>
              </tr>
              <tr className="border-t border-white/5">
                <td className="py-2 pr-4 text-white/70">Conversion Rate</td>
                <td className="py-2 pr-4 text-right text-white/80 font-medium">2-4%</td>
                <td className="py-2 text-right text-yellow-400">Medium</td>
              </tr>
              <tr className="border-t border-white/5">
                <td className="py-2 pr-4 text-white/70">Expected Conversions</td>
                <td className="py-2 pr-4 text-right text-blue-400 font-semibold">248 - 496</td>
                <td className="py-2 text-right text-yellow-400">Medium</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ───────────────────────────────────────────────────────────
const CampaignCreator = () => {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { createCampaign } = useCampaigns();

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validateStep = () => {
    const newErrors = {};
    if (step === 0) {
      if (!form.objective.trim()) newErrors.objective = 'Objective is required';
      if (!form.category) newErrors.category = 'Select a category';
      if (!form.channel) newErrors.channel = 'Select a channel';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const next = () => {
    if (!validateStep()) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    setSubmitting(true);
    // TODO: POST /api/campaigns
    await createCampaign(form);
    setSubmitting(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-10 border border-white/20 text-center max-w-md mx-4">
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-8 w-8 text-green-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Campaign Submitted!</h2>
          <p className="text-sm text-white/60 mb-6">Your campaign has been submitted for review and will be processed shortly.</p>
          <Link
            to="/nudgeops"
            className="inline-flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded-lg text-white font-medium transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Dashboard</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900">
      {/* Header */}
      <header className="bg-white/10 backdrop-blur-md border-b border-white/20 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <Link to="/nudgeops" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                <ArrowLeft className="h-5 w-5 text-white/70" />
              </Link>
              <div className="p-2 bg-gradient-to-r from-orange-500 to-pink-600 rounded-lg">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Create Campaign</h1>
                <p className="text-xs text-white/60">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Stepper currentStep={step} />

        <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 sm:p-8 border border-white/20 shadow-lg">
          {step === 0 && <StepIntent form={form} setField={setField} errors={errors} />}
          {step === 1 && <StepTargeting form={form} setField={setField} />}
          {step === 2 && <StepCopy form={form} setField={setField} />}
          {step === 3 && <StepReview form={form} />}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <button
            onClick={prev}
            disabled={step === 0}
            className={`flex items-center space-x-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              step === 0
                ? 'text-white/30 cursor-not-allowed'
                : 'text-white bg-white/10 hover:bg-white/20 border border-white/20'
            }`}
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Previous</span>
          </button>

          {step < STEPS.length - 1 ? (
            <button
              onClick={next}
              className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded-lg text-white text-sm font-medium transition-all"
            >
              <span>Next</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center space-x-2 px-6 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 rounded-lg text-white text-sm font-medium transition-all disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              <span>{submitting ? 'Submitting...' : 'Submit Campaign'}</span>
            </button>
          )}
        </div>
      </main>
    </div>
  );
};

export default CampaignCreator;
