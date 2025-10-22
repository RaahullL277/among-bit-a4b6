import React from 'react';
import { BarChart3, Users, Calendar, Activity, Plus, Bell, Search, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import useDashboard from '../hooks/useDashboard';
import AnalyticsChart from '../components/AnalyticsChart';
import TeamProgressWidget from '../components/TeamProgressWidget';
import UsageStats from '../components/UsageStats';

const Dashboard = () => {
  const { dashboardData, loading, error } = useDashboard();

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="bg-red-500/10 backdrop-blur-md rounded-xl p-8 border border-red-400/20 text-center">
          <div className="text-red-400 text-lg font-semibold mb-2">Error Loading Dashboard</div>
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
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg">
                  <BarChart3 className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">Dashboard</h1>
                  <p className="text-sm text-white/60">Analytics & Team Overview</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
                <input
                  type="text"
                  placeholder="Search..."
                  className="pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent"
                />
              </div>
              
              <button className="p-2 hover:bg-white/10 rounded-lg transition-colors relative">
                <Bell className="h-5 w-5 text-white/70" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>
              
              <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                <Settings className="h-5 w-5 text-white/70" />
              </button>
              
              <Link 
                to="/tasks"
                className="flex items-center space-x-2 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 px-4 py-2 rounded-lg text-white font-medium transition-all"
              >
                <Plus className="h-4 w-4" />
                <span>New Task</span>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Overview Cards */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 animate-pulse">
                <div className="h-4 bg-white/20 rounded mb-2 w-1/2"></div>
                <div className="h-8 bg-white/20 rounded mb-2"></div>
                <div className="h-3 bg-white/20 rounded w-2/3"></div>
              </div>
            ))}
          </div>
        ) : dashboardData ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg hover:bg-white/15 transition-colors">
              <div className="flex items-center space-x-3 mb-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Activity className="h-5 w-5 text-blue-400" />
                </div>
                <span className="text-sm font-medium text-white/70">Total Tasks</span>
              </div>
              <div className="text-3xl font-bold text-white mb-1">{dashboardData.overview.totalTasks}</div>
              <div className="text-sm text-green-400">+12% from last month</div>
            </div>
            
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg hover:bg-white/15 transition-colors">
              <div className="flex items-center space-x-3 mb-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <BarChart3 className="h-5 w-5 text-green-400" />
                </div>
                <span className="text-sm font-medium text-white/70">Completed</span>
              </div>
              <div className="text-3xl font-bold text-white mb-1">{dashboardData.overview.completedTasks}</div>
              <div className="text-sm text-green-400">76% completion rate</div>
            </div>
            
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg hover:bg-white/15 transition-colors">
              <div className="flex items-center space-x-3 mb-3">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <Calendar className="h-5 w-5 text-purple-400" />
                </div>
                <span className="text-sm font-medium text-white/70">Active Projects</span>
              </div>
              <div className="text-3xl font-bold text-white mb-1">{dashboardData.overview.activeProjects}</div>
              <div className="text-sm text-blue-400">2 due this week</div>
            </div>
            
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg hover:bg-white/15 transition-colors">
              <div className="flex items-center space-x-3 mb-3">
                <div className="p-2 bg-orange-500/20 rounded-lg">
                  <Users className="h-5 w-5 text-orange-400" />
                </div>
                <span className="text-sm font-medium text-white/70">Team Members</span>
              </div>
              <div className="text-3xl font-bold text-white mb-1">{dashboardData.overview.teamMembers}</div>
              <div className="text-sm text-orange-400">All active</div>
            </div>
          </div>
        ) : null}

        {/* Main Dashboard Content */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Analytics Chart - Takes up 2 columns */}
          <div className="xl:col-span-2">
            <AnalyticsChart 
              data={dashboardData?.analytics} 
              loading={loading} 
            />
          </div>
          
          {/* Team Progress Widget */}
          <div className="xl:col-span-1">
            <TeamProgressWidget 
              data={dashboardData?.teamProgress} 
              loading={loading} 
            />
          </div>
        </div>

        {/* Usage Stats - Full width */}
        <div className="mt-8">
          <UsageStats 
            data={dashboardData?.usageStats} 
            loading={loading} 
          />
        </div>

        {/* Quick Actions */}
        <div className="mt-8">
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg">
            <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Link
                to="/tasks"
                className="flex flex-col items-center p-4 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 hover:border-white/20 transition-all"
              >
                <Plus className="h-6 w-6 text-blue-400 mb-2" />
                <span className="text-sm font-medium text-white">Create Task</span>
              </Link>
              <Link
                to="/collaboration"
                className="flex flex-col items-center p-4 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 hover:border-white/20 transition-all"
              >
                <Users className="h-6 w-6 text-green-400 mb-2" />
                <span className="text-sm font-medium text-white">Invite Member</span>
              </Link>
              <Link
                to="/calendar"
                className="flex flex-col items-center p-4 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 hover:border-white/20 transition-all"
              >
                <Calendar className="h-6 w-6 text-purple-400 mb-2" />
                <span className="text-sm font-medium text-white">Schedule Meeting</span>
              </Link>
              <button className="flex flex-col items-center p-4 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 hover:border-white/20 transition-all">
                <BarChart3 className="h-6 w-6 text-orange-400 mb-2" />
                <span className="text-sm font-medium text-white">View Reports</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;