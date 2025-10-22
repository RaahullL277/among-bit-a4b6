import React from 'react';
import { TrendingUp, Calendar, Target } from 'lucide-react';

const AnalyticsChart = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 animate-pulse">
        <div className="h-6 bg-white/20 rounded mb-4 w-1/3"></div>
        <div className="h-64 bg-white/10 rounded"></div>
      </div>
    );
  }

  if (!data) return null;

  const { weeklyProgress, monthlyStats } = data;
  const maxValue = Math.max(...weeklyProgress.map(item => Math.max(item.tasks, item.completed)));

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-lg">
            <TrendingUp className="h-5 w-5 text-blue-400" />
          </div>
          <h2 className="text-xl font-semibold text-white">Analytics Overview</h2>
        </div>
        <div className="flex space-x-2">
          <button className="px-3 py-1 text-xs bg-blue-500/20 text-blue-300 rounded-full border border-blue-400/30 hover:bg-blue-500/30 transition-colors">
            Weekly
          </button>
          <button className="px-3 py-1 text-xs bg-white/10 text-white/60 rounded-full border border-white/20 hover:bg-white/20 transition-colors">
            Monthly
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Progress Chart */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Calendar className="h-4 w-4 text-blue-400" />
            <h3 className="text-sm font-medium text-white/80">Weekly Task Progress</h3>
          </div>
          <div className="h-48 flex items-end space-x-2">
            {weeklyProgress.map((day, index) => (
              <div key={day.day} className="flex-1 flex flex-col items-center space-y-1">
                <div className="w-full flex flex-col space-y-1">
                  <div 
                    className="bg-gradient-to-t from-blue-500/50 to-blue-400/70 rounded-t"
                    style={{ height: `${(day.tasks / maxValue) * 100}%`, minHeight: '4px' }}
                  ></div>
                  <div 
                    className="bg-gradient-to-t from-green-500/50 to-green-400/70 rounded-t"
                    style={{ height: `${(day.completed / maxValue) * 100}%`, minHeight: '4px' }}
                  ></div>
                </div>
                <span className="text-xs text-white/60">{day.day}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center space-x-4 text-xs">
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-blue-400/70 rounded"></div>
              <span className="text-white/70">Total Tasks</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-green-400/70 rounded"></div>
              <span className="text-white/70">Completed</span>
            </div>
          </div>
        </div>

        {/* Monthly Trends */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Target className="h-4 w-4 text-green-400" />
            <h3 className="text-sm font-medium text-white/80">Monthly Performance</h3>
          </div>
          <div className="h-48 flex items-end space-x-2">
            {monthlyStats.map((month, index) => {
              const maxMonthValue = Math.max(...monthlyStats.map(m => m.value));
              return (
                <div key={month.month} className="flex-1 flex flex-col items-center space-y-2">
                  <div className="w-full relative">
                    <div 
                      className="bg-gradient-to-t from-purple-500/50 to-purple-400/70 rounded-t transition-all duration-500"
                      style={{ height: `${(month.value / maxMonthValue) * 100}%`, minHeight: '8px' }}
                    ></div>
                    <div className="absolute -top-6 left-1/2 transform -translate-x-1/2">
                      <span className="text-xs text-white/80">{month.value}</span>
                    </div>
                  </div>
                  <span className="text-xs text-white/60">{month.month}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-white/10">
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-400">92%</div>
          <div className="text-xs text-white/60">Completion Rate</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-400">+18%</div>
          <div className="text-xs text-white/60">Growth</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-400">247</div>
          <div className="text-xs text-white/60">Total Tasks</div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsChart;