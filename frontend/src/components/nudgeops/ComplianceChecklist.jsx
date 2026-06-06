import React, { useState } from 'react';
import { CheckCircle, XCircle, ChevronDown, ChevronRight } from 'lucide-react';

const ComplianceChecklist = ({ checks = [] }) => {
  const [expandedIdx, setExpandedIdx] = useState(null);

  const toggle = (idx) => {
    setExpandedIdx(expandedIdx === idx ? null : idx);
  };

  const allPassed = checks.every((c) => c.passed);

  return (
    <div className="space-y-1">
      <div className="flex items-center space-x-2 mb-3">
        {allPassed ? (
          <CheckCircle className="h-5 w-5 text-green-400" />
        ) : (
          <XCircle className="h-5 w-5 text-red-400" />
        )}
        <span className={`text-sm font-semibold ${allPassed ? 'text-green-400' : 'text-red-400'}`}>
          {allPassed ? 'All compliance checks passed' : 'Some checks require attention'}
        </span>
      </div>

      {checks.map((check, idx) => (
        <div key={idx} className="rounded-lg overflow-hidden">
          <button
            onClick={() => check.details && toggle(idx)}
            className="w-full flex items-center space-x-3 px-3 py-2 hover:bg-white/5 rounded-lg transition-colors text-left"
          >
            {check.passed ? (
              <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
            )}
            <span className="text-sm text-white/80 flex-1">{check.name}</span>
            {check.details && (
              expandedIdx === idx
                ? <ChevronDown className="h-4 w-4 text-white/40" />
                : <ChevronRight className="h-4 w-4 text-white/40" />
            )}
          </button>
          {expandedIdx === idx && check.details && (
            <div className="ml-10 mr-3 mb-2 px-3 py-2 bg-white/5 rounded-lg text-xs text-white/60 leading-relaxed">
              {check.details}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ComplianceChecklist;
