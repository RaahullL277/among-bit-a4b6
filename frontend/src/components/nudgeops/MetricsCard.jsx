import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const MetricsCard = ({ title, metrics = [] }) => {
  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl p-5 border border-white/20 shadow-lg">
      {title && <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-4">{title}</h3>}
      <div className="space-y-4">
        {metrics.map((metric, idx) => {
          const trendUp = metric.trend === 'up';
          const trendDown = metric.trend === 'down';
          const trendNeutral = !metric.trend || metric.trend === 'neutral';
          const isPositiveTrend = metric.trendPositive !== undefined ? metric.trendPositive : trendUp;

          return (
            <div key={idx} className="flex items-center justify-between">
              <div className="flex-1">
                <div className="text-xs text-white/50 mb-1">{metric.label}</div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-xl font-bold text-white">{metric.value}</span>
                  {metric.benchmark && (
                    <span className="text-xs text-white/40">
                      / {metric.benchmark} benchmark
                    </span>
                  )}
                </div>
              </div>
              {metric.trend && (
                <div className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${
                  isPositiveTrend
                    ? 'bg-green-500/20 text-green-400'
                    : trendNeutral
                      ? 'bg-white/10 text-white/50'
                      : 'bg-red-500/20 text-red-400'
                }`}>
                  {trendUp && <TrendingUp className="h-3 w-3" />}
                  {trendDown && <TrendingDown className="h-3 w-3" />}
                  {trendNeutral && <Minus className="h-3 w-3" />}
                  <span>{metric.trendValue || metric.trend}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MetricsCard;
