import React, { useState } from 'react';
import {
  Zap, ArrowLeft, Activity, ChevronDown, ChevronRight, Send, Eye,
  MousePointer, Target, UserMinus, Clock, Search, RefreshCw, Bot,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useCampaigns, useMonitoring } from '../../hooks/nudgeops/useNudgeOps';
import HealthIndicator from '../../components/nudgeops/HealthIndicator';

const metricIcons = {
  deliveryRate: Send,
  openRate: Eye,
  ctr: MousePointer,
  conversionRate: Target,
  unsubscribeRate: UserMinus,
};

const metricLabels = {
  deliveryRate: 'Delivery Rate',
  openRate: 'Open Rate',
  ctr: 'CTR',
  conversionRate: 'Conversion',
  unsubscribeRate: 'Unsubscribe',
};

const metricBenchmarks = {
  deliveryRate: 95,
  openRate: 25,
  ctr: 5,
  conversionRate: 2.5,
  unsubscribeRate: 0.2,
};

const MetricBar = ({ label, value, benchmark, icon: Icon, danger = false }) => {
  const pct = Math.min((value / (benchmark * 2)) * 100, 100);
  const benchPct = Math.min((benchmark / (benchmark * 2)) * 100, 100);
  const isGood = danger ? value <= benchmark : value >= benchmark;
  const barColor = isGood ? 'from-green-500 to-emerald-400' : 'from-red-500 to-orange-400';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Icon className="h-3.5 w-3.5 text-white/50" />
          <span className="text-xs text-white/60">{label}</span>
        </div>
        <span className={`text-sm font-semibold ${isGood ? 'text-green-400' : 'text-red-400'}`}>{value}%</span>
      </div>
      <div className="relative w-full bg-white/10 rounded-full h-1.5">
        <div className={`absolute inset-y-0 left-0 bg-gradient-to-r ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
        <div className="absolute inset-y-0 bg-white/40 w-px" style={{ left: `${benchPct}%` }} title={`Benchmark: ${benchmark}%`} />
      </div>
    </div>
  );
};

const VariantComparison = ({ variants }) => (
  <div className="space-y-3">
    <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider">A/B Test Results</h4>
    {variants.map((v) => (
      <div key={v.id} className="flex items-center space-x-3">
        <span className={`text-xs font-bold w-6 ${v.status === 'paused' ? 'text-white/30' : 'text-blue-400'}`}>{v.id}</span>
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <span className={`text-xs ${v.status === 'paused' ? 'text-white/30 line-through' : 'text-white/70'}`}>{v.name}</span>
            <div className="flex items-center space-x-3 text-xs">
              <span className="text-white/50">CTR: <span className="text-white/80 font-medium">{v.ctr}%</span></span>
              <span className="text-white/50">Conv: <span className="text-white/80 font-medium">{v.conversion}%</span></span>
            </div>
          </div>
          <div className="flex space-x-1">
            <div className="bg-blue-500/40 rounded-full h-1.5" style={{ width: `${(v.ctr / 20) * 100}%` }} />
            <div className="bg-green-500/40 rounded-full h-1.5" style={{ width: `${(v.conversion / 20) * 100}%` }} />
          </div>
        </div>
        {v.status === 'paused' && (
          <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full border border-red-400/30">Paused</span>
        )}
      </div>
    ))}
  </div>
);

const AutoActionLog = ({ actions }) => {
  if (!actions || actions.length === 0) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider flex items-center space-x-1.5">
        <Bot className="h-3.5 w-3.5" />
        <span>Auto-Actions</span>
      </h4>
      {actions.map((a, idx) => (
        <div key={idx} className="flex items-start space-x-2 text-xs">
          <Clock className="h-3 w-3 text-white/30 mt-0.5 flex-shrink-0" />
          <div>
            <span className="text-orange-400 font-medium">{a.action}</span>
            <span className="text-white/40"> — {a.reason}</span>
            <div className="text-white/25 mt-0.5">{new Date(a.timestamp).toLocaleString()}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

const CampaignRow = ({ campaign }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors text-left"
      >
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          <HealthIndicator status={campaign.health} />
          <div className="min-w-0">
            <div className="text-sm font-medium text-white truncate">{campaign.name}</div>
            <div className="text-xs text-white/40">{campaign.channel} &middot; {campaign.cohortSize.toLocaleString()} users &middot; since {campaign.startDate}</div>
          </div>
        </div>
        <div className="flex items-center space-x-4 ml-4 flex-shrink-0">
          <div className="hidden sm:flex items-center space-x-4">
            {['deliveryRate', 'openRate', 'ctr', 'conversionRate'].map((key) => (
              <div key={key} className="text-right">
                <div className="text-xs font-semibold text-white">{campaign.metrics[key]}%</div>
                <div className="text-[10px] text-white/30">{metricLabels[key]}</div>
              </div>
            ))}
          </div>
          {expanded ? <ChevronDown className="h-4 w-4 text-white/40" /> : <ChevronRight className="h-4 w-4 text-white/40" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/10 p-5 space-y-6">
          {/* Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-4">
              <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider">Delivery Health</h4>
              <MetricBar label="Delivery Rate" value={campaign.metrics.deliveryRate} benchmark={metricBenchmarks.deliveryRate} icon={Send} />
            </div>
            <div className="space-y-4">
              <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider">Engagement Health</h4>
              <MetricBar label="Open Rate" value={campaign.metrics.openRate} benchmark={metricBenchmarks.openRate} icon={Eye} />
              <MetricBar label="CTR" value={campaign.metrics.ctr} benchmark={metricBenchmarks.ctr} icon={MousePointer} />
              <MetricBar label="Conversion" value={campaign.metrics.conversionRate} benchmark={metricBenchmarks.conversionRate} icon={Target} />
            </div>
            <div className="space-y-4">
              <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider">Safety Health</h4>
              <MetricBar label="Unsubscribe Rate" value={campaign.metrics.unsubscribeRate} benchmark={metricBenchmarks.unsubscribeRate} icon={UserMinus} danger />
            </div>
          </div>

          {/* A/B + Auto Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <VariantComparison variants={campaign.variants} />
            <AutoActionLog actions={campaign.autoActions} />
          </div>
        </div>
      )}
    </div>
  );
};

const CampaignMonitor = () => {
  const { campaigns, loading: campaignsLoading, fetchCampaigns } = useCampaigns();
  const { monitoringData, loading: monitoringLoading } = useMonitoring();
  const [search, setSearch] = useState('');

  const filtered = campaigns.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.channel.toLowerCase().includes(search.toLowerCase())
  );

  const healthCounts = {
    healthy: campaigns.filter((c) => c.health === 'healthy').length,
    warning: campaigns.filter((c) => c.health === 'warning').length,
    critical: campaigns.filter((c) => c.health === 'critical').length,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900">
      {/* Header */}
      <header className="bg-white/10 backdrop-blur-md border-b border-white/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <Link to="/nudgeops" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                <ArrowLeft className="h-5 w-5 text-white/70" />
              </Link>
              <div className="p-2 bg-gradient-to-r from-orange-500 to-pink-600 rounded-lg">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Campaign Monitor</h1>
                <p className="text-xs text-white/60">Real-time campaign performance</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter campaigns..."
                  className="pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <button
                onClick={fetchCampaigns}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title="Refresh"
              >
                <RefreshCw className="h-5 w-5 text-white/70" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Health Summary */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20 flex items-center space-x-3">
            <HealthIndicator status="healthy" />
            <div>
              <div className="text-2xl font-bold text-white">{healthCounts.healthy}</div>
              <div className="text-xs text-white/50">Healthy</div>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20 flex items-center space-x-3">
            <HealthIndicator status="warning" />
            <div>
              <div className="text-2xl font-bold text-white">{healthCounts.warning}</div>
              <div className="text-xs text-white/50">Warning</div>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20 flex items-center space-x-3">
            <HealthIndicator status="critical" />
            <div>
              <div className="text-2xl font-bold text-white">{healthCounts.critical}</div>
              <div className="text-xs text-white/50">Critical</div>
            </div>
          </div>
        </div>

        {/* Metrics Over Time Chart */}
        {monitoringData && (
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg mb-8">
            <div className="flex items-center space-x-3 mb-5">
              <div className="p-2 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-lg">
                <Activity className="h-5 w-5 text-blue-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Metrics Over Time</h2>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={monitoringData.metricsOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 12 }} />
                <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(15,15,35,0.95)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px' }}
                  labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
                  itemStyle={{ color: 'rgba(255,255,255,0.8)' }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }} />
                <Line type="monotone" dataKey="deliveryRate" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3 }} name="Delivery %" />
                <Line type="monotone" dataKey="openRate" stroke="#34d399" strokeWidth={2} dot={{ r: 3 }} name="Open %" />
                <Line type="monotone" dataKey="ctr" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} name="CTR %" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Campaign List */}
        {campaignsLoading ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((campaign) => (
              <CampaignRow key={campaign.id} campaign={campaign} />
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-12 text-white/40">
                <Activity className="h-8 w-8 mx-auto mb-2" />
                <p className="text-sm">No campaigns match your filter.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default CampaignMonitor;
