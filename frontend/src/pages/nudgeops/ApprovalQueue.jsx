import React, { useState } from 'react';
import {
  Zap, ArrowLeft, CheckCircle, XCircle, Clock, AlertTriangle,
  ChevronDown, ChevronRight, Shield, X, Edit3, History,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApprovals } from '../../hooks/nudgeops/useNudgeOps';

const urgencyColors = {
  high: { badge: 'bg-red-500/20 text-red-400 border-red-400/30', dot: 'bg-red-400' },
  medium: { badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-400/30', dot: 'bg-yellow-400' },
  low: { badge: 'bg-green-500/20 text-green-400 border-green-400/30', dot: 'bg-green-400' },
};

const decisionColors = {
  approved: 'text-green-400',
  approved_with_changes: 'text-yellow-400',
  rejected: 'text-red-400',
};

const decisionLabels = {
  approved: 'Approved',
  approved_with_changes: 'Approved with Changes',
  rejected: 'Rejected',
};

// ── Modal ────────────────────────────────────────────────────────────────────
const ActionModal = ({ title, placeholder, onSubmit, onClose }) => {
  const [text, setText] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900/95 backdrop-blur-md border border-white/20 rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
            <X className="h-5 w-5 text-white/60" />
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          rows={4}
          className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none mb-4"
        />
        <div className="flex justify-end space-x-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={() => { onSubmit(text); onClose(); }}
            disabled={!text.trim()}
            className="px-4 py-2 text-sm bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-lg font-medium transition-all disabled:opacity-40"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Approval Card ────────────────────────────────────────────────────────────
const ApprovalCard = ({ approval, onApprove, onApproveWithChanges, onReject, onDefer }) => {
  const [expanded, setExpanded] = useState(false);
  const [modalType, setModalType] = useState(null); // 'changes' | 'reject'
  const urg = urgencyColors[approval.urgency] || urgencyColors.low;

  return (
    <>
      <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-lg overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-start justify-between p-5 hover:bg-white/5 transition-colors text-left"
        >
          <div className="flex-1 min-w-0 mr-4">
            <div className="flex items-center space-x-2 mb-2">
              <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${urg.badge}`}>
                {approval.urgency.charAt(0).toUpperCase() + approval.urgency.slice(1)} Priority
              </span>
              <span className="text-xs text-white/30">
                {new Date(approval.createdAt).toLocaleString()}
              </span>
            </div>
            <p className="text-sm text-white/90 leading-relaxed">{approval.what}</p>
          </div>
          {expanded ? <ChevronDown className="h-5 w-5 text-white/40 mt-1" /> : <ChevronRight className="h-5 w-5 text-white/40 mt-1" />}
        </button>

        {/* Expanded Details */}
        {expanded && (
          <div className="border-t border-white/10 p-5 space-y-5">
            {/* Structured Format */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-white/40 uppercase tracking-wider font-semibold">WHAT</span>
                <p className="text-sm text-white/80 mt-1">{approval.what}</p>
              </div>
              <div>
                <span className="text-xs text-white/40 uppercase tracking-wider font-semibold">WHO</span>
                <p className="text-sm text-white/80 mt-1">{approval.who}</p>
              </div>
              <div>
                <span className="text-xs text-white/40 uppercase tracking-wider font-semibold">WHERE</span>
                <p className="text-sm text-white/80 mt-1">{approval.where}</p>
              </div>
              <div>
                <span className="text-xs text-white/40 uppercase tracking-wider font-semibold">WHEN</span>
                <p className="text-sm text-white/80 mt-1">{approval.when}</p>
              </div>
              <div>
                <span className="text-xs text-white/40 uppercase tracking-wider font-semibold">COST</span>
                <p className="text-sm text-white/80 mt-1">{approval.cost}</p>
              </div>
            </div>

            {/* Projected Impact */}
            <div className="bg-white/5 rounded-lg p-4">
              <span className="text-xs text-white/40 uppercase tracking-wider font-semibold">PROJECTED IMPACT</span>
              <div className="grid grid-cols-3 gap-4 mt-3">
                <div>
                  <div className="text-lg font-bold text-green-400">{approval.projectedImpact.conversions}</div>
                  <div className="text-xs text-white/40">Conversions</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-blue-400">{approval.projectedImpact.revenue}</div>
                  <div className="text-xs text-white/40">Revenue</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-purple-400">{approval.projectedImpact.confidence}</div>
                  <div className="text-xs text-white/40">Confidence</div>
                </div>
              </div>
            </div>

            {/* Risks */}
            <div>
              <span className="text-xs text-white/40 uppercase tracking-wider font-semibold">RISKS</span>
              <div className="space-y-2 mt-2">
                {approval.risks.map((r, idx) => (
                  <div key={idx} className="bg-yellow-500/5 rounded-lg p-3 border border-yellow-400/10">
                    <div className="flex items-start space-x-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-yellow-400 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-yellow-300">{r.risk}</div>
                    </div>
                    <div className="mt-1 ml-5 text-xs text-white/50">
                      <span className="text-green-400 font-medium">Mitigation:</span> {r.mitigation}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Compliance */}
            <div>
              <span className="text-xs text-white/40 uppercase tracking-wider font-semibold">COMPLIANCE</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {Object.entries(approval.compliance).map(([key, passed]) => (
                  <div key={key} className="flex items-center space-x-1.5 px-2 py-1 bg-white/5 rounded-lg">
                    {passed ? (
                      <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-400" />
                    )}
                    <span className="text-xs text-white/60">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recommendation */}
            <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-400/20">
              <span className="text-xs text-white/40 uppercase tracking-wider font-semibold">RECOMMENDATION</span>
              <p className="text-sm text-blue-300 mt-2 leading-relaxed">{approval.recommendation}</p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={() => onApprove(approval.id)}
                className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 rounded-lg text-white text-sm font-medium transition-all"
              >
                <CheckCircle className="h-4 w-4" />
                <span>Approve</span>
              </button>
              <button
                onClick={() => setModalType('changes')}
                className="flex items-center space-x-2 px-5 py-2.5 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-400/30 rounded-lg text-yellow-300 text-sm font-medium transition-all"
              >
                <Edit3 className="h-4 w-4" />
                <span>Approve with Changes</span>
              </button>
              <button
                onClick={() => setModalType('reject')}
                className="flex items-center space-x-2 px-5 py-2.5 bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 rounded-lg text-red-300 text-sm font-medium transition-all"
              >
                <XCircle className="h-4 w-4" />
                <span>Reject</span>
              </button>
              <button
                onClick={() => onDefer(approval.id)}
                className="flex items-center space-x-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-white/70 text-sm font-medium transition-all"
              >
                <Clock className="h-4 w-4" />
                <span>Defer</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {modalType === 'changes' && (
        <ActionModal
          title="Approve with Changes"
          placeholder="Describe the changes you'd like to make..."
          onSubmit={(text) => onApproveWithChanges(approval.id, text)}
          onClose={() => setModalType(null)}
        />
      )}
      {modalType === 'reject' && (
        <ActionModal
          title="Reject — Provide Reason"
          placeholder="Explain why this action is being rejected..."
          onSubmit={(text) => onReject(approval.id, text)}
          onClose={() => setModalType(null)}
        />
      )}
    </>
  );
};

// ── Main Component ───────────────────────────────────────────────────────────
const ApprovalQueue = () => {
  const { approvals, history, loading, error, approveAction, approveWithChanges, rejectAction, deferAction } = useApprovals();
  const [showHistory, setShowHistory] = useState(false);

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="bg-red-500/10 backdrop-blur-md rounded-xl p-8 border border-red-400/20 text-center">
          <div className="text-red-400 text-lg font-semibold mb-2">Error Loading Approvals</div>
          <div className="text-red-300 text-sm">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900">
      {/* Header */}
      <header className="bg-white/10 backdrop-blur-md border-b border-white/20 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <Link to="/nudgeops" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                <ArrowLeft className="h-5 w-5 text-white/70" />
              </Link>
              <div className="p-2 bg-gradient-to-r from-orange-500 to-pink-600 rounded-lg">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Approval Queue</h1>
                <p className="text-xs text-white/60">{approvals.length} pending &middot; Tier 2 actions</p>
              </div>
            </div>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`flex items-center space-x-2 px-3 py-2 text-sm rounded-lg border transition-all ${
                showHistory
                  ? 'bg-blue-500/20 border-blue-400/30 text-blue-300'
                  : 'bg-white/10 border-white/20 text-white/60 hover:bg-white/15'
              }`}
            >
              <History className="h-4 w-4" />
              <span>History</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* Pending Approvals */}
            {!showHistory && (
              <div className="space-y-4">
                {approvals.length === 0 ? (
                  <div className="text-center py-16 text-white/40">
                    <CheckCircle className="h-10 w-10 mx-auto mb-3" />
                    <p className="text-lg font-medium">All caught up!</p>
                    <p className="text-sm mt-1">No pending approvals at this time.</p>
                  </div>
                ) : (
                  approvals.map((approval) => (
                    <ApprovalCard
                      key={approval.id}
                      approval={approval}
                      onApprove={approveAction}
                      onApproveWithChanges={approveWithChanges}
                      onReject={rejectAction}
                      onDefer={deferAction}
                    />
                  ))
                )}
              </div>
            )}

            {/* History */}
            {showHistory && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-white mb-4">Decision History</h2>
                {history.length === 0 ? (
                  <p className="text-sm text-white/40 text-center py-8">No history yet.</p>
                ) : (
                  history.map((item) => (
                    <div key={item.id} className="bg-white/5 rounded-xl p-4 border border-white/10">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm text-white/80">{item.what}</p>
                          <div className="flex items-center space-x-3 mt-2 text-xs text-white/40">
                            <span className={`font-medium ${decisionColors[item.decision]}`}>
                              {decisionLabels[item.decision]}
                            </span>
                            <span>&middot;</span>
                            <span>{item.decidedBy}</span>
                            <span>&middot;</span>
                            <span>{new Date(item.decidedAt).toLocaleDateString()}</span>
                          </div>
                          {item.changes && (
                            <div className="mt-2 text-xs text-yellow-300/70 bg-yellow-500/5 rounded px-2 py-1 inline-block">
                              Changes: {item.changes}
                            </div>
                          )}
                          {item.reason && (
                            <div className="mt-2 text-xs text-red-300/70 bg-red-500/5 rounded px-2 py-1 inline-block">
                              Reason: {item.reason}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default ApprovalQueue;
