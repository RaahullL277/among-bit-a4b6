import React, { useState } from 'react';
import { Calendar, Clock, MessageSquare, FileText, Users, Zap, TrendingUp, Activity } from 'lucide-react';

const UsageStats = ({ data, loading }) => {
  const [activeTab, setActiveTab] = useState('overview');

  if (loading) {
    return (
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 animate-pulse">
        <div className="h-6 bg-white/20 rounded mb-4 w-1/3"></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white/10 rounded-lg p-4">
              <div className="h-4 bg-white/20 rounded mb-2"></div>
              <div className="h-6 bg-white/20 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { calendarUsage, taskCreation, teamCollaboration, productivity } = data;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'productivity', label: 'Productivity', icon: Zap }
  ];

  const renderOverviewTab = () => (
    <div className="space-y-6">
      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 rounded-lg p-4 border border-blue-400/20">
          <div className="flex items-center space-x-2 mb-2">
            <Calendar className="h-4 w-4 text-blue-400" />
            <span className="text-xs text-blue-300">Daily Usage</span>
          </div>
          <div className="text-2xl font-bold text-white">{calendarUsage.daily}%</div>
          <div className="text-xs text-white/60">Calendar utilization</div>
        </div>

        <div className="bg-gradient-to-br from-green-500/20 to-green-600/10 rounded-lg p-4 border border-green-400/20">
          <div className="flex items-center space-x-2 mb-2">
            <TrendingUp className="h-4 w-4 text-green-400" />
            <span className="text-xs text-green-300">Growth</span>
          </div>
          <div className="text-2xl font-bold text-white">+{taskCreation.growth}%</div>
          <div className="text-xs text-white/60">Task creation</div>
        </div>

        <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 rounded-lg p-4 border border-purple-400/20">
          <div className="flex items-center space-x-2 mb-2">
            <MessageSquare className="h-4 w-4 text-purple-400" />
            <span className="text-xs text-purple-300">Messages</span>
          </div>
          <div className="text-2xl font-bold text-white">{teamCollaboration.messages}</div>
          <div className="text-xs text-white/60">Team communication</div>
        </div>

        <div className="bg-gradient-to-br from-orange-500/20 to-orange-600/10 rounded-lg p-4 border border-orange-400/20">
          <div className="flex items-center space-x-2 mb-2">
            <Zap className="h-4 w-4 text-orange-400" />
            <span className="text-xs text-orange-300">Efficiency</span>
          </div>
          <div className="text-2xl font-bold text-white">{productivity.efficiency}%</div>
          <div className="text-xs text-white/60">Overall productivity</div>
        </div>
      </div>

      {/* Detailed Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white/5 rounded-lg p-5">
          <h4 className="text-sm font-medium text-white mb-4 flex items-center space-x-2">
            <FileText className="h-4 w-4 text-blue-400" />
            <span>Task Management</span>
          </h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-white/70">This Week</span>
              <span className="text-sm font-medium text-white">{taskCreation.thisWeek} tasks</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-white/70">Last Week</span>
              <span className="text-sm font-medium text-white">{taskCreation.lastWeek} tasks</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-white/70">Weekly Growth</span>
              <span className="text-sm font-medium text-green-400">+{taskCreation.growth}%</span>
            </div>
          </div>
        </div>

        <div className="bg-white/5 rounded-lg p-5">
          <h4 className="text-sm font-medium text-white mb-4 flex items-center space-x-2">
            <Users className="h-4 w-4 text-green-400" />
            <span>Team Collaboration</span>
          </h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-white/70">Meetings</span>
              <span className="text-sm font-medium text-white">{teamCollaboration.meetings}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-white/70">Shared Files</span>
              <span className="text-sm font-medium text-white">{teamCollaboration.sharedFiles}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-white/70">Messages</span>
              <span className="text-sm font-medium text-white">{teamCollaboration.messages}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderCalendarTab = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-full flex items-center justify-center border border-blue-400/30">
            <span className="text-2xl font-bold text-blue-400">{calendarUsage.daily}%</span>
          </div>
          <div className="text-sm font-medium text-white">Daily Usage</div>
          <div className="text-xs text-white/60">Calendar events</div>
        </div>
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-green-500/20 to-green-600/20 rounded-full flex items-center justify-center border border-green-400/30">
            <span className="text-2xl font-bold text-green-400">{calendarUsage.weekly}%</span>
          </div>
          <div className="text-sm font-medium text-white">Weekly Usage</div>
          <div className="text-xs text-white/60">Meeting schedule</div>
        </div>
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-purple-500/20 to-purple-600/20 rounded-full flex items-center justify-center border border-purple-400/30">
            <span className="text-2xl font-bold text-purple-400">{calendarUsage.monthly}%</span>
          </div>
          <div className="text-sm font-medium text-white">Monthly Usage</div>
          <div className="text-xs text-white/60">Overall planning</div>
        </div>
      </div>
    </div>
  );

  const renderProductivityTab = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white/5 rounded-lg p-5">
          <h4 className="text-sm font-medium text-white mb-4 flex items-center space-x-2">
            <Clock className="h-4 w-4 text-blue-400" />
            <span>Time Tracking</span>
          </h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-white/70">Focus Time</span>
              <span className="text-lg font-semibold text-white">{productivity.focusTime}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-white/70">Break Time</span>
              <span className="text-lg font-semibold text-white">{productivity.breakTime}</span>
            </div>
          </div>
        </div>

        <div className="bg-white/5 rounded-lg p-5">
          <h4 className="text-sm font-medium text-white mb-4 flex items-center space-x-2">
            <Zap className="h-4 w-4 text-orange-400" />
            <span>Efficiency Score</span>
          </h4>
          <div className="text-center">
            <div className="text-3xl font-bold text-orange-400 mb-2">{productivity.efficiency}%</div>
            <div className="w-full bg-white/10 rounded-full h-2">
              <div 
                className="bg-gradient-to-r from-orange-400 to-orange-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${productivity.efficiency}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-lg">
            <Activity className="h-5 w-5 text-orange-400" />
          </div>
          <h2 className="text-xl font-semibold text-white">Usage Statistics</h2>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 mb-6 bg-white/5 rounded-lg p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'text-white/60 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="min-h-48">
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'calendar' && renderCalendarTab()}
        {activeTab === 'productivity' && renderProductivityTab()}
      </div>
    </div>
  );
};

export default UsageStats;