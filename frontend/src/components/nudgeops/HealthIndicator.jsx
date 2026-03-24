import React from 'react';

const statusConfig = {
  healthy: {
    color: 'bg-green-400',
    ring: 'ring-green-400/30',
    text: 'text-green-400',
    label: 'Healthy',
  },
  warning: {
    color: 'bg-yellow-400',
    ring: 'ring-yellow-400/30',
    text: 'text-yellow-400',
    label: 'Warning',
  },
  critical: {
    color: 'bg-red-400',
    ring: 'ring-red-400/30',
    text: 'text-red-400',
    label: 'Critical',
  },
};

const HealthIndicator = ({ status = 'healthy', label, value }) => {
  const config = statusConfig[status] || statusConfig.healthy;

  return (
    <div className="flex items-center space-x-2">
      <span className="relative flex h-3 w-3">
        {status === 'critical' && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.color} opacity-75`} />
        )}
        <span className={`relative inline-flex rounded-full h-3 w-3 ${config.color} ring-2 ${config.ring}`} />
      </span>
      {label && <span className="text-sm text-white/70">{label}</span>}
      {value !== undefined && <span className={`text-sm font-semibold ${config.text}`}>{value}</span>}
    </div>
  );
};

export default HealthIndicator;
