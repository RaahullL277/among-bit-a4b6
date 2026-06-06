import React, { useState } from 'react';
import { Target, Users, Send, FileText, FlaskConical, Shield, TrendingUp, AlertTriangle, ChevronDown, ChevronRight, CheckCircle, XCircle } from 'lucide-react';

const Section = ({ icon: Icon, title, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-white/10">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center space-x-3 py-3 px-1 hover:bg-white/5 rounded transition-colors text-left"
      >
        <Icon className="h-4 w-4 text-blue-400 flex-shrink-0" />
        <span className="text-sm font-semibold text-white flex-1">{title}</span>
        {open ? <ChevronDown className="h-4 w-4 text-white/40" /> : <ChevronRight className="h-4 w-4 text-white/40" />}
      </button>
      {open && <div className="pb-3 pl-7 pr-1">{children}</div>}
    </div>
  );
};

const CampaignBriefCard = ({ campaign }) => {
  if (!campaign) return null;

  const {
    name,
    objective,
    cohort,
    channel,
    cohortSize,
    variants = [],
    experimentDesign,
    compliance = {},
    projectedImpact = {},
    risks = [],
  } = campaign;

  const complianceChecks = [
    { key: 'gdprConsent', label: 'GDPR Consent' },
    { key: 'ccpaOptOut', label: 'CCPA Opt-out' },
    { key: 'frequencyCap', label: 'Frequency Cap' },
    { key: 'quietHours', label: 'Quiet Hours' },
    { key: 'unsubscribeLink', label: 'Unsubscribe Link' },
  ];

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="p-5 bg-gradient-to-r from-blue-500/10 to-purple-500/10">
        <h3 className="text-lg font-bold text-white mb-1">{name || 'Campaign Brief'}</h3>
        {objective && <p className="text-sm text-white/60">{objective}</p>}
      </div>

      <div className="p-5 space-y-0">
        {/* Objective */}
        {objective && (
          <Section icon={Target} title="Objective" defaultOpen={true}>
            <p className="text-sm text-white/70 leading-relaxed">{objective}</p>
          </Section>
        )}

        {/* Cohort / Targeting */}
        <Section icon={Users} title="Cohort Details">
          <div className="space-y-2">
            {cohort && <p className="text-sm text-white/70">{cohort}</p>}
            {cohortSize && (
              <div className="flex items-center space-x-2">
                <span className="text-xs text-white/50">Estimated Reach:</span>
                <span className="text-sm font-semibold text-blue-400">{cohortSize.toLocaleString()} users</span>
              </div>
            )}
          </div>
        </Section>

        {/* Channel Strategy */}
        <Section icon={Send} title="Channel Strategy">
          <div className="inline-block px-3 py-1 bg-blue-500/20 text-blue-300 text-sm rounded-full border border-blue-400/30">
            {channel || 'Email'}
          </div>
        </Section>

        {/* Copy Variants */}
        {variants.length > 0 && (
          <Section icon={FileText} title={`Copy Variants (${variants.length})`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-white/50 text-xs uppercase tracking-wider">
                    <th className="text-left py-2 pr-4">Variant</th>
                    <th className="text-left py-2 pr-4">Name</th>
                    <th className="text-right py-2 pr-4">CTR</th>
                    <th className="text-right py-2">Conv.</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v) => (
                    <tr key={v.id} className="border-t border-white/5">
                      <td className="py-2 pr-4 text-white/80 font-medium">{v.id}</td>
                      <td className="py-2 pr-4 text-white/70">{v.name}</td>
                      <td className="py-2 pr-4 text-right text-white/70">{v.ctr}%</td>
                      <td className="py-2 text-right text-white/70">{v.conversion}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* Experiment Design */}
        {experimentDesign && (
          <Section icon={FlaskConical} title="Experiment Design">
            <p className="text-sm text-white/70 leading-relaxed">{experimentDesign}</p>
          </Section>
        )}

        {/* Compliance Status */}
        <Section icon={Shield} title="Compliance Status">
          <div className="space-y-2">
            {complianceChecks.map((check) => (
              <div key={check.key} className="flex items-center space-x-2">
                {compliance[check.key] ? (
                  <CheckCircle className="h-4 w-4 text-green-400" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-400" />
                )}
                <span className="text-sm text-white/70">{check.label}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Projected Impact */}
        {Object.keys(projectedImpact).length > 0 && (
          <Section icon={TrendingUp} title="Projected Impact">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(projectedImpact).map(([key, value]) => (
                    <tr key={key} className="border-t border-white/5">
                      <td className="py-2 pr-4 text-white/50 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</td>
                      <td className="py-2 text-right text-white/80 font-medium">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* Risk Register */}
        {risks.length > 0 && (
          <Section icon={AlertTriangle} title={`Risk Register (${risks.length})`}>
            <div className="space-y-3">
              {risks.map((risk, idx) => (
                <div key={idx} className="bg-white/5 rounded-lg p-3">
                  <div className="flex items-start space-x-2 mb-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-yellow-400 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-yellow-300">{risk.risk}</span>
                  </div>
                  {risk.mitigation && (
                    <div className="ml-5.5 pl-1 text-xs text-white/50">
                      <span className="text-green-400 font-medium">Mitigation:</span> {risk.mitigation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
};

export default CampaignBriefCard;
