import React, { useState } from 'react';
import { Calendar, User, Tag, MoreVertical, Edit, Trash2, CheckCircle, Circle, Clock, AlertCircle } from 'lucide-react';

const TaskList = ({ tasks, onEditTask, onDeleteTask, onUpdateTask, loading }) => {
  const [expandedTask, setExpandedTask] = useState(null);
  const [showDropdown, setShowDropdown] = useState(null);

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 animate-pulse">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="h-5 bg-white/20 rounded mb-2 w-3/4"></div>
                <div className="h-4 bg-white/10 rounded w-1/2"></div>
              </div>
              <div className="h-6 w-16 bg-white/20 rounded-full"></div>
            </div>
            <div className="h-3 bg-white/10 rounded mb-2"></div>
            <div className="flex justify-between items-center">
              <div className="h-4 bg-white/20 rounded w-1/4"></div>
              <div className="h-4 bg-white/20 rounded w-1/4"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high':
        return 'from-red-500 to-red-600';
      case 'medium':
        return 'from-yellow-500 to-yellow-600';
      case 'low':
        return 'from-green-500 to-green-600';
      default:
        return 'from-gray-500 to-gray-600';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'in-progress':
        return <Clock className="h-4 w-4 text-blue-400" />;
      case 'todo':
        return <Circle className="h-4 w-4 text-gray-400" />;
      default:
        return <Circle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/20 text-green-400 border-green-400/30';
      case 'in-progress':
        return 'bg-blue-500/20 text-blue-400 border-blue-400/30';
      case 'todo':
        return 'bg-gray-500/20 text-gray-400 border-gray-400/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-400/30';
    }
  };

  const isOverdue = (dueDate) => {
    return new Date(dueDate) < new Date() && new Date(dueDate).toDateString() !== new Date().toDateString();
  };

  const handleStatusChange = async (task, newStatus) => {
    try {
      await onUpdateTask(task.id, { status: newStatus });
    } catch (error) {
      console.error('Error updating task status:', error);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (!tasks.length) {
    return (
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-12 border border-white/20 text-center">
        <Circle className="h-12 w-12 text-white/40 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">No tasks found</h3>
        <p className="text-white/60">Create a new task to get started with your project management.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tasks.map((task) => (
        <div
          key={task.id}
          className={`bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg hover:bg-white/15 transition-all duration-200 ${
            expandedTask === task.id ? 'ring-2 ring-blue-400/30' : ''
          }`}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-start space-x-3 flex-1">
              <button
                onClick={() => handleStatusChange(task, task.status === 'completed' ? 'todo' : 'completed')}
                className="mt-1 hover:scale-110 transition-transform"
              >
                {getStatusIcon(task.status)}
              </button>
              
              <div className="flex-1 min-w-0">
                <h3 className={`text-lg font-semibold mb-2 ${
                  task.status === 'completed' ? 'text-white/60 line-through' : 'text-white'
                }`}>
                  {task.title}
                </h3>
                
                <div className="flex items-center space-x-4 mb-3">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full border ${
                    getStatusColor(task.status)
                  }`}>
                    {task.status.replace('-', ' ').toUpperCase()}
                  </span>
                  
                  <span className={`px-2 py-1 text-xs font-medium rounded-full bg-gradient-to-r ${
                    getPriorityColor(task.priority)
                  } text-white`}>
                    {task.priority.toUpperCase()}
                  </span>
                  
                  {isOverdue(task.dueDate) && task.status !== 'completed' && (
                    <div className="flex items-center space-x-1 text-red-400">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-xs font-medium">OVERDUE</span>
                    </div>
                  )}
                </div>
                
                {expandedTask === task.id && (
                  <p className="text-white/70 text-sm mb-4 leading-relaxed">
                    {task.description}
                  </p>
                )}
                
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-1 text-white/60">
                      <Calendar className="h-4 w-4" />
                      <span className={isOverdue(task.dueDate) && task.status !== 'completed' ? 'text-red-400' : ''}>
                        {formatDate(task.dueDate)}
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-1 text-white/60">
                      <User className="h-4 w-4" />
                      <span>{task.assignee}</span>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                    className="text-blue-400 hover:text-blue-300 text-xs font-medium"
                  >
                    {expandedTask === task.id ? 'Show Less' : 'Show More'}
                  </button>
                </div>
                
                {task.tags.length > 0 && (
                  <div className="flex items-center space-x-2 mt-3">
                    <Tag className="h-4 w-4 text-white/60" />
                    <div className="flex flex-wrap gap-1">
                      {task.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 text-xs bg-white/10 text-white/70 rounded border border-white/20"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="relative">
              <button
                onClick={() => setShowDropdown(showDropdown === task.id ? null : task.id)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <MoreVertical className="h-4 w-4 text-white/60" />
              </button>
              
              {showDropdown === task.id && (
                <div className="absolute right-0 mt-2 w-48 bg-gray-800/95 backdrop-blur-md rounded-lg border border-white/20 shadow-xl z-10">
                  <div className="py-1">
                    <button
                      onClick={() => {
                        onEditTask(task);
                        setShowDropdown(null);
                      }}
                      className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
                    >
                      <Edit className="h-4 w-4" />
                      <span>Edit Task</span>
                    </button>
                    
                    <div className="border-t border-white/10 my-1"></div>
                    
                    <button
                      onClick={() => handleStatusChange(task, 'todo')}
                      className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
                      disabled={task.status === 'todo'}
                    >
                      <Circle className="h-4 w-4" />
                      <span>Mark as To Do</span>
                    </button>
                    
                    <button
                      onClick={() => handleStatusChange(task, 'in-progress')}
                      className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
                      disabled={task.status === 'in-progress'}
                    >
                      <Clock className="h-4 w-4" />
                      <span>Mark as In Progress</span>
                    </button>
                    
                    <button
                      onClick={() => handleStatusChange(task, 'completed')}
                      className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
                      disabled={task.status === 'completed'}
                    >
                      <CheckCircle className="h-4 w-4" />
                      <span>Mark as Completed</span>
                    </button>
                    
                    <div className="border-t border-white/10 my-1"></div>
                    
                    <button
                      onClick={() => {
                        onDeleteTask(task.id);
                        setShowDropdown(null);
                      }}
                      className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>Delete Task</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default TaskList;