import React from 'react';
import {
  Zap, Eye, BarChart3, Plus, CheckSquare, AlertTriangle, ArrowRight,
  Activity, Clock, Lightbulb, Bell, Search, Settings, Rocket,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNudgeOps, useCampaigns, useMonitoring } from '../../hooks/nudgeops/useNudgeOps';
import HealthIndicator from '../../components/nudgeops/HealthIndicator';

const StatCard = ({ icon: Icon, iconBg, iconColor, label, value, subtext, subtextColor = 'text-white/50' }) => (
  <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg hover:bg-white/15 transition-colors">
    <div className="flex items-center space-x-3 mb-3">
      <div className={`p-2 ${iconBg} rounded-lg`}>
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </div>
      <span className="text-sm font-medium text-white/70">{label}</span>
    </div>
    <div className="text-3xl font-bold text-white mb-1">{value}</div>
    {subtext && <div className={`text-sm ${subtextColor}`}>{subtext}</div>}
  </div>
);

const AlertItem = ({ alert }) => {
  const severityStyles = {
    info: 'border-blue-400/30 bg-blue-500/5',
    warning: 'border-yellow-400/30 bg-yellow-500/5',
    critical: 'border-red-400/30 bg-red-500/5',
  };
  const severityDot = {
    info: 'bg-blue-400',
    warning: 'bg-yellow-400',
    critical: 'bg-red-400',
  };
  const style = severityStyles[alert.severity] || severityStyles.info;
  const dot = severityDot[alert.severity] || severityDot.info;

  return (
    <div className={`flex items-start space-x-3 p-3 rounded-lg border ${style}`}>
      <span className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${dot}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/80">{alert.message}</p>
        <p className="text-xs text-white/40 mt-1">
          {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
};

const NudgeOpsDashboard = () => {
  const { session, loading: sessionLoading, error: sessionError } = useNudgeOps();
  const { campaigns, loading: campaignsLoading } = useCampaigns();
  const { monitoringData, loading: monitoringLoading } = useMonitoring();

  const loading = sessionLoading || campaignsLoading;

  if (sessionError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="bg-red-500/10 backdrop-blur-md rounded-xl p-8 border border-red-400/20 text-center">
          <div className="text-red-400 text-lg font-semibold mb-2">Error Loading NudgeOps</div>
          <div className="text-red-300 text-sm">{sessionError}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900">
      {/* Header */}
      <header className="bg-white/10 backdrop-blur-md border-b border-white/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gradient-to-r from-orange-500 to-pink-600 rounded-lg">
                <Zap className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">NudgeOps</h1>
                <p className="text-sm text-white/60">AI Campaign Agent</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
                <input
                  type="text"
                  placeholder="Search campaigns..."
                  className="pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-transparent"
                />
              </div>
              <button className="p-2 hover:bg-white/10 rounded-lg transition-colors relative">
                <Bell className="h-5 w-5 text-white/70" />
                {session?.anomalies > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </button>
              <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                <Settings className="h-5 w-5 text-white/70" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Greeting */}
        {session && !loading && (
          <div className="mb-8 bg-gradient-to-r from-orange-500/10 to-pink-500/10 backdrop-blur-md rounded-xl p-5 border border-orange-400/20">
            <p className="text-white/90 text-sm leading-relaxed">{session.greeting}</p>
          </div>
        )}

        {/* Stats Cards */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5 mb-8">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 animate-pulse">
                <div className="h-4 bg-white/20 rounded mb-2 w-1/2" />
                <div className="h-8 bg-white/20 rounded mb-2" />
                <div className="h-3 bg-white/20 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : session ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5 mb-8">
            <StatCard
              icon={Rocket}
              iconBg="bg-blue-500/20"
              iconColor="text-blue-400"
              label="Live Campaigns"
              value={session.liveCampaigns}
              subtext="All channels"
              subtextColor="text-blue-400"
            />
            <StatCard
              icon={CheckSquare}
              iconBg="bg-yellow-500/20"
              iconColor="text-yellow-400"
              label="Pending Approvals"
              value={session.pendingApprovals}
              subtext="Action required"
              subtextColor="text-yellow-400"
            />
            <StatCard
              icon={Clock}
              iconBg="bg-purple-500/20"
              iconColor="text-purple-400"
              label="Scheduled Launches"
              value={session.scheduledLaunches}
              subtext="Next 7 days"
              subtextColor="text-purple-400"
            />
            <StatCard
              icon={AlertTriangle}
              iconBg="bg-red-500/20"
              iconColor="text-red-400"
              label="Anomalies"
              value={session.anomalies}
              subtext="Needs attention"
              subtextColor="text-red-400"
            />
            <StatCard
              icon={Lightbulb}
              iconBg="bg-green-500/20"
              iconColor="text-green-400"
              label="Suggestions"
              value={session.proactiveSuggestions}
              subtext="Opportunities found"
              subtextColor="text-green-400"
            />
          </div>
        ) : null}

        {/* Campaign Health + Alerts row */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-8">
          {/* Campaign Health Cards */}
          <div className="xl:col-span-2">
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-lg">
                    <Activity className="h-5 w-5 text-blue-400" />
                  </div>
                  <h2 className="text-lg font-semibold text-white">Campaign Health</h2>
                </div>
                <Link
                  to="/nudgeops/monitor"
                  className="text-sm text-blue-400 hover:text-blue-300 flex items-center space-x-1 transition-colors"
                >
                  <span>View all</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {campaignsLoading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-16 bg-white/10 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {campaigns.slice(0, 5).map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-colors"
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <HealthIndicator status={c.health} />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white truncate">{c.name}</div>
                          <div className="text-xs text-white/50">{c.channel} &middot; {c.cohortSize.toLocaleString()} users</div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4 flex-shrink-0 ml-4">
                        <div className="text-right hidden sm:block">
                          <div className="text-sm font-semibold text-white">{c.metrics.ctr}%</div>
                          <div className="text-xs text-white/40">CTR</div>
                        </div>
                        <div className="text-right hidden sm:block">
                          <div className="text-sm font-semibold text-white">{c.metrics.conversionRate}%</div>
                          <div className="text-xs text-white/40">Conv.</div>
                        </div>
                        <div className="text-right hidden md:block">
                          <div className="text-sm font-semibold text-white">{c.metrics.deliveryRate}%</div>
                          <div className="text-xs text-white/40">Delivery</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Alerts */}
          <div className="xl:col-span-1">
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg h-full">
              <div className="flex items-center space-x-3 mb-5">
                <div className="p-2 bg-red-500/20 rounded-lg">
                  <Bell className="h-5 w-5 text-red-400" />
                </div>
                <h2 className="text-lg font-semibold text-white">Auto-Actions & Alerts</h2>
              </div>

              {session?.alerts?.length > 0 ? (
                <div className="space-y-3">
                  {session.alerts.map((alert) => (
                    <AlertItem key={alert.id} alert={alert} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-white/40">
                  <Bell className="h-8 w-8 mb-2" />
                  <p className="text-sm">No alerts at this time</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg">
          <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link
              to="/nudgeops/create"
              className="flex items-center space-x-3 p-4 bg-gradient-to-r from-blue-500/20 to-purple-500/20 hover:from-blue-500/30 hover:to-purple-500/30 rounded-lg border border-blue-400/20 hover:border-blue-400/40 transition-all"
            >
              <Plus className="h-5 w-5 text-blue-400" />
              <div>
                <div className="text-sm font-medium text-white">Create Campaign</div>
                <div className="text-xs text-white/50">Launch a new nudge campaign</div>
              </div>
            </Link>
            <Link
              to="/nudgeops/approvals"
              className="flex items-center space-x-3 p-4 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 hover:from-yellow-500/30 hover:to-orange-500/30 rounded-lg border border-yellow-400/20 hover:border-yellow-400/40 transition-all"
            >
              <Eye className="h-5 w-5 text-yellow-400" />
              <div>
                <div className="text-sm font-medium text-white">View Approvals</div>
                <div className="text-xs text-white/50">{session?.pendingApprovals || 0} pending</div>
              </div>
            </Link>
            <Link
              to="/nudgeops/analytics"
              className="flex items-center space-x-3 p-4 bg-gradient-to-r from-green-500/20 to-teal-500/20 hover:from-green-500/30 hover:to-teal-500/30 rounded-lg border border-green-400/20 hover:border-green-400/40 transition-all"
            >
              <BarChart3 className="h-5 w-5 text-green-400" />
              <div>
                <div className="text-sm font-medium text-white">View Analytics</div>
                <div className="text-xs text-white/50">Performance insights</div>
              </div>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
};

export default NudgeOpsDashboard;
