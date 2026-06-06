import React from 'react';
import {
  Zap, ArrowLeft, BarChart3, TrendingUp, Send, Lightbulb,
  Sparkles, ArrowRight, Megaphone, Hash, MousePointer, Target,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useAnalytics } from '../../hooks/nudgeops/useNudgeOps';

const insightTypeIcons = {
  copy: Sparkles,
  channel: Send,
  cohort: Hash,
  timing: Target,
};

const insightTypeColors = {
  copy: 'text-purple-400 bg-purple-500/20',
  channel: 'text-blue-400 bg-blue-500/20',
  cohort: 'text-green-400 bg-green-500/20',
  timing: 'text-orange-400 bg-orange-500/20',
};

const AnalyticsDashboard = () => {
  const { analytics, loading, error } = useAnalytics();

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="bg-red-500/10 backdrop-blur-md rounded-xl p-8 border border-red-400/20 text-center">
          <div className="text-red-400 text-lg font-semibold mb-2">Error Loading Analytics</div>
          <div className="text-red-300 text-sm">{error}</div>
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
              <Link to="/nudgeops" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                <ArrowLeft className="h-5 w-5 text-white/70" />
              </Link>
              <div className="p-2 bg-gradient-to-r from-orange-500 to-pink-600 rounded-lg">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Analytics</h1>
                <p className="text-xs text-white/60">Campaign performance & insights</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Overview Cards */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 animate-pulse">
                <div className="h-4 bg-white/20 rounded mb-2 w-1/2" />
                <div className="h-8 bg-white/20 rounded mb-2" />
                <div className="h-3 bg-white/20 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : analytics ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg hover:bg-white/15 transition-colors">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="p-2 bg-blue-500/20 rounded-lg">
                    <Megaphone className="h-5 w-5 text-blue-400" />
                  </div>
                  <span className="text-sm font-medium text-white/70">Total Campaigns</span>
                </div>
                <div className="text-3xl font-bold text-white mb-1">{analytics.overview.totalCampaigns}</div>
                <div className="text-sm text-blue-400">Across all channels</div>
              </div>

              <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg hover:bg-white/15 transition-colors">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="p-2 bg-green-500/20 rounded-lg">
                    <Send className="h-5 w-5 text-green-400" />
                  </div>
                  <span className="text-sm font-medium text-white/70">Total Nudges Sent</span>
                </div>
                <div className="text-3xl font-bold text-white mb-1">{(analytics.overview.totalNudgesSent / 1000).toFixed(0)}K</div>
                <div className="text-sm text-green-400">{analytics.overview.totalNudgesSent.toLocaleString()} total</div>
              </div>

              <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg hover:bg-white/15 transition-colors">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="p-2 bg-purple-500/20 rounded-lg">
                    <MousePointer className="h-5 w-5 text-purple-400" />
                  </div>
                  <span className="text-sm font-medium text-white/70">Avg CTR</span>
                </div>
                <div className="text-3xl font-bold text-white mb-1">{analytics.overview.avgCtr}%</div>
                <div className="text-sm text-purple-400">+1.2% vs last month</div>
              </div>

              <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg hover:bg-white/15 transition-colors">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="p-2 bg-orange-500/20 rounded-lg">
                    <Target className="h-5 w-5 text-orange-400" />
                  </div>
                  <span className="text-sm font-medium text-white/70">Avg Conversion</span>
                </div>
                <div className="text-3xl font-bold text-white mb-1">{analytics.overview.avgConversion}%</div>
                <div className="text-sm text-orange-400">+0.6% vs last month</div>
              </div>
            </div>

            {/* Trends Chart */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg">
                <div className="flex items-center space-x-3 mb-5">
                  <div className="p-2 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-lg">
                    <TrendingUp className="h-5 w-5 text-blue-400" />
                  </div>
                  <h2 className="text-lg font-semibold text-white">Weekly Trends</h2>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={analytics.trends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="week" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 12 }} />
                    <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'rgba(15,15,35,0.95)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px' }}
                      labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="ctr" stroke="#a78bfa" strokeWidth={2} dot={{ r: 4 }} name="CTR %" />
                    <Line type="monotone" dataKey="conversion" stroke="#34d399" strokeWidth={2} dot={{ r: 4 }} name="Conv %" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg">
                <div className="flex items-center space-x-3 mb-5">
                  <div className="p-2 bg-gradient-to-r from-green-500/20 to-teal-500/20 rounded-lg">
                    <BarChart3 className="h-5 w-5 text-green-400" />
                  </div>
                  <h2 className="text-lg font-semibold text-white">Campaigns per Week</h2>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={analytics.trends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="week" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 12 }} />
                    <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'rgba(15,15,35,0.95)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px' }}
                      labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
                    />
                    <Bar dataKey="campaigns" fill="url(#barGradient)" radius={[4, 4, 0, 0]} name="Campaigns" />
                    <defs>
                      <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#818cf8" stopOpacity={0.8} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0.4} />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Campaign Performance Table */}
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg mb-8">
              <div className="flex items-center space-x-3 mb-5">
                <div className="p-2 bg-gradient-to-r from-orange-500/20 to-pink-500/20 rounded-lg">
                  <BarChart3 className="h-5 w-5 text-orange-400" />
                </div>
                <h2 className="text-lg font-semibold text-white">Campaign Performance</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-white/40 uppercase tracking-wider border-b border-white/10">
                      <th className="text-left py-3 pr-4">Campaign</th>
                      <th className="text-left py-3 pr-4">Channel</th>
                      <th className="text-right py-3 pr-4">Sent</th>
                      <th className="text-right py-3 pr-4">Open %</th>
                      <th className="text-right py-3 pr-4">CTR %</th>
                      <th className="text-right py-3">Conv %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.campaignPerformance.map((c, idx) => (
                      <tr key={idx} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                        <td className="py-3 pr-4 text-white/80 font-medium">{c.name}</td>
                        <td className="py-3 pr-4">
                          <span className="px-2 py-0.5 text-xs bg-white/10 text-white/60 rounded-full border border-white/10">
                            {c.channel}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-right text-white/60">{c.nudgesSent.toLocaleString()}</td>
                        <td className="py-3 pr-4 text-right text-white/70">{c.openRate}%</td>
                        <td className="py-3 pr-4 text-right">
                          <span className={c.ctr >= 5 ? 'text-green-400 font-medium' : 'text-white/70'}>{c.ctr}%</span>
                        </td>
                        <td className="py-3 text-right">
                          <span className={c.conversion >= 2.5 ? 'text-green-400 font-medium' : 'text-white/70'}>{c.conversion}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Learning Insights */}
            <div className="mb-8">
              <div className="flex items-center space-x-3 mb-5">
                <div className="p-2 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-lg">
                  <Lightbulb className="h-5 w-5 text-purple-400" />
                </div>
                <h2 className="text-lg font-semibold text-white">Learning Insights</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {analytics.learningInsights.map((insight, idx) => {
                  const Icon = insightTypeIcons[insight.type] || Sparkles;
                  const colorClass = insightTypeColors[insight.type] || insightTypeColors.copy;
                  return (
                    <div key={idx} className="bg-white/10 backdrop-blur-md rounded-xl p-5 border border-white/20 shadow-lg hover:bg-white/15 transition-colors">
                      <div className="flex items-start space-x-3">
                        <div className={`p-2 rounded-lg flex-shrink-0 ${colorClass.split(' ')[1]}`}>
                          <Icon className={`h-4 w-4 ${colorClass.split(' ')[0]}`} />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-white mb-1">{insight.title}</h3>
                          <p className="text-xs text-white/50 leading-relaxed">{insight.detail}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Proactive Opportunities */}
            <div>
              <div className="flex items-center space-x-3 mb-5">
                <div className="p-2 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-lg">
                  <Sparkles className="h-5 w-5 text-green-400" />
                </div>
                <h2 className="text-lg font-semibold text-white">Proactive Opportunities</h2>
              </div>
              <div className="space-y-4">
                {analytics.proactiveOpportunities.map((opp) => (
                  <div key={opp.id} className="bg-white/10 backdrop-blur-md rounded-xl p-5 border border-white/20 shadow-lg">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 mr-4">
                        <h3 className="text-sm font-semibold text-white mb-1">{opp.title}</h3>
                        <p className="text-xs text-white/50 leading-relaxed mb-2">{opp.description}</p>
                        <span className="inline-block text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full border border-green-400/30">
                          Est. impact: {opp.estimatedImpact}
                        </span>
                      </div>
                      <Link
                        to="/nudgeops/campaigns/new"
                        className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded-lg text-white text-sm font-medium transition-all flex-shrink-0"
                      >
                        <span>Create Campaign</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
};

export default AnalyticsDashboard;
