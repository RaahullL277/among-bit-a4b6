import React from 'react';
import { Filter, SortAsc, SortDesc, CheckCircle, Clock, Circle, AlertTriangle, Calendar, User, Tag } from 'lucide-react';

const PrioritySorter = ({ 
  filter, 
  sortBy, 
  onFilterChange, 
  onSortChange, 
  tasks
}) => {
  const filterOptions = [
    { value: 'all', label: 'All Tasks', icon: Filter, count: tasks.length },
    { value: 'todo', label: 'To Do', icon: Circle, count: tasks.filter(t => t.status === 'todo').length },
    { value: 'in-progress', label: 'In Progress', icon: Clock, count: tasks.filter(t => t.status === 'in-progress').length },
    { value: 'completed', label: 'Completed', icon: CheckCircle, count: tasks.filter(t => t.status === 'completed').length }
  ];

  const sortOptions = [
    { value: 'priority', label: 'Priority', icon: AlertTriangle },
    { value: 'dueDate', label: 'Due Date', icon: Calendar },
    { value: 'title', label: 'Title', icon: Tag },
    { value: 'status', label: 'Status', icon: CheckCircle }
  ];

  const getFilterColor = (filterValue) => {
    switch (filterValue) {
      case 'todo':
        return filter === filterValue ? 'bg-gray-500/30 text-gray-300 border-gray-400/40' : 'bg-gray-500/10 text-gray-400 border-gray-400/20';
      case 'in-progress':
        return filter === filterValue ? 'bg-blue-500/30 text-blue-300 border-blue-400/40' : 'bg-blue-500/10 text-blue-400 border-blue-400/20';
      case 'completed':
        return filter === filterValue ? 'bg-green-500/30 text-green-300 border-green-400/40' : 'bg-green-500/10 text-green-400 border-green-400/20';
      default:
        return filter === filterValue ? 'bg-white/20 text-white border-white/40' : 'bg-white/10 text-white/60 border-white/20';
    }
  };

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg">
      <div className="flex flex-col space-y-6">
        {/* Filter Section */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
            <Filter className="h-5 w-5" />
            <span>Filter Tasks</span>
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {filterOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  onClick={() => onFilterChange(option.value)}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-all hover:scale-105 ${
                    getFilterColor(option.value)
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Icon className="h-4 w-4" />
                    <span className="text-sm font-medium">{option.label}</span>
                  </div>
                  <span className="text-xs font-bold bg-white/20 px-2 py-1 rounded-full">
                    {option.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sort Section */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
            <SortAsc className="h-5 w-5" />
            <span>Sort Tasks</span>
          </h3>
          
          <div className="flex flex-wrap gap-2">
            {sortOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  onClick={() => onSortChange(option.value)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg border transition-all hover:scale-105 ${
                    sortBy === option.value
                      ? 'bg-purple-500/30 text-purple-300 border-purple-400/40'
                      : 'bg-white/10 text-white/60 border-white/20 hover:bg-white/20 hover:text-white/80'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="pt-4 border-t border-white/10">
          <h4 className="text-sm font-medium text-white/80 mb-3">Quick Stats</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">
                {tasks.filter(t => t.status === 'completed').length}
              </div>
              <div className="text-xs text-green-400">Completed</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-white">
                {tasks.filter(t => t.status === 'in-progress').length}
              </div>
              <div className="text-xs text-blue-400">In Progress</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-white">
                {tasks.filter(t => t.priority === 'high').length}
              </div>
              <div className="text-xs text-red-400">High Priority</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-white">
                {tasks.filter(t => {
                  const dueDate = new Date(t.dueDate);
                  const today = new Date();
                  return dueDate < today && t.status !== 'completed';
                }).length}
              </div>
              <div className="text-xs text-orange-400">Overdue</div>
            </div>
          </div>
        </div>

        {/* Priority Legend */}
        <div className="pt-4 border-t border-white/10">
          <h4 className="text-sm font-medium text-white/80 mb-3">Priority Legend</h4>
          <div className="flex space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-gradient-to-r from-red-500 to-red-600"></div>
              <span className="text-xs text-white/60">High</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-gradient-to-r from-yellow-500 to-yellow-600"></div>
              <span className="text-xs text-white/60">Medium</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-gradient-to-r from-green-500 to-green-600"></div>
              <span className="text-xs text-white/60">Low</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrioritySorter;