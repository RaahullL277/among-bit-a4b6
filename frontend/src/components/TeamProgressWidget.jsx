import React from 'react';
import { Users, Award, ChevronRight, Star } from 'lucide-react';

const TeamProgressWidget = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 animate-pulse">
        <div className="h-6 bg-white/20 rounded mb-4 w-1/3"></div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-white/20 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-white/20 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-white/10 rounded w-full"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const getProgressColor = (progress) => {
    if (progress >= 90) return 'from-green-400 to-green-600';
    if (progress >= 75) return 'from-blue-400 to-blue-600';
    if (progress >= 60) return 'from-yellow-400 to-yellow-600';
    return 'from-red-400 to-red-600';
  };

  const getPerformanceIcon = (progress) => {
    if (progress >= 90) return <Star className="h-4 w-4 text-yellow-400 fill-current" />;
    if (progress >= 80) return <Award className="h-4 w-4 text-blue-400" />;
    return null;
  };

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-r from-green-500/20 to-blue-500/20 rounded-lg">
            <Users className="h-5 w-5 text-green-400" />
          </div>
          <h2 className="text-xl font-semibold text-white">Team Progress</h2>
        </div>
        <button className="flex items-center space-x-1 text-sm text-blue-400 hover:text-blue-300 transition-colors">
          <span>View All</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4">
        {data.map((member) => (
          <div key={member.id} className="group hover:bg-white/5 rounded-lg p-3 transition-colors">
            <div className="flex items-center space-x-4">
              {/* Avatar */}
              <div className="relative">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                  {member.avatar}
                </div>
                {getPerformanceIcon(member.progress) && (
                  <div className="absolute -top-1 -right-1 bg-gray-800 rounded-full p-0.5">
                    {getPerformanceIcon(member.progress)}
                  </div>
                )}
              </div>

              {/* Member Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-medium text-white truncate">{member.name}</h3>
                  <span className="text-xs text-white/60">{member.progress}%</span>
                </div>
                <p className="text-xs text-white/60 mb-2">{member.role}</p>
                
                {/* Progress Bar */}
                <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                  <div 
                    className={`h-full bg-gradient-to-r ${getProgressColor(member.progress)} transition-all duration-500 ease-out`}
                    style={{ width: `${member.progress}%` }}
                  ></div>
                </div>
                
                {/* Stats */}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-white/60">
                    {member.tasksCompleted} tasks completed
                  </span>
                  <div className="flex items-center space-x-2">
                    {member.progress >= 90 && (
                      <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">
                        Top Performer
                      </span>
                    )}
                    {member.progress >= 80 && member.progress < 90 && (
                      <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
                        High Achiever
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Team Summary */}
      <div className="mt-6 pt-6 border-t border-white/10">
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-lg font-bold text-white">{data.length}</div>
            <div className="text-xs text-white/60">Team Members</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-green-400">
              {Math.round(data.reduce((sum, member) => sum + member.progress, 0) / data.length)}%
            </div>
            <div className="text-xs text-white/60">Avg Progress</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-blue-400">
              {data.reduce((sum, member) => sum + member.tasksCompleted, 0)}
            </div>
            <div className="text-xs text-white/60">Total Tasks</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamProgressWidget;