import React, { useState } from 'react';
import { CheckSquare, Clock, User, Calendar, Tag, Plus, Filter, Search, MoreVertical, UserPlus, Trash2 } from 'lucide-react';

const TaskAssignment = ({ 
  tasks, 
  teamMembers, 
  currentUser,
  onAssignTask, 
  onUnassignTask, 
  onUpdateTaskStatus, 
  onCreateTask,
  loading 
}) => {
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTaskActions, setShowTaskActions] = useState(null);
  const [assignmentNotes, setAssignmentNotes] = useState('');
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium',
    dueDate: '',
    estimatedHours: '',
    tags: []
  });
  const [newTag, setNewTag] = useState('');

  const statusOptions = [
    { value: 'all', label: 'All Tasks', count: tasks.length },
    { value: 'todo', label: 'To Do', count: tasks.filter(t => t.status === 'todo').length },
    { value: 'assigned', label: 'Assigned', count: tasks.filter(t => t.status === 'assigned').length },
    { value: 'in-progress', label: 'In Progress', count: tasks.filter(t => t.status === 'in-progress').length },
    { value: 'completed', label: 'Completed', count: tasks.filter(t => t.status === 'completed').length }
  ];

  const assigneeOptions = [
    { value: 'all', label: 'All Assignees' },
    { value: 'unassigned', label: 'Unassigned' },
    ...teamMembers.map(member => ({ value: member.id.toString(), label: member.name }))
  ];

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

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/20 text-green-400 border-green-400/30';
      case 'in-progress':
        return 'bg-blue-500/20 text-blue-400 border-blue-400/30';
      case 'assigned':
        return 'bg-purple-500/20 text-purple-400 border-purple-400/30';
      case 'todo':
        return 'bg-gray-500/20 text-gray-400 border-gray-400/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-400/30';
    }
  };

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         task.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         task.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesStatus = filterStatus === 'all' || task.status === filterStatus;
    
    let matchesAssignee = true;
    if (filterAssignee === 'unassigned') {
      matchesAssignee = !task.assigneeId;
    } else if (filterAssignee !== 'all') {
      matchesAssignee = task.assigneeId?.toString() === filterAssignee;
    }
    
    return matchesSearch && matchesStatus && matchesAssignee;
  });

  const handleAssignTask = async (taskId, assigneeId) => {
    try {
      await onAssignTask(taskId, assigneeId, assignmentNotes);
      setShowAssignModal(null);
      setAssignmentNotes('');
    } catch (error) {
      console.error('Error assigning task:', error);
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    try {
      await onCreateTask(newTask);
      setShowCreateModal(false);
      setNewTask({
        title: '',
        description: '',
        priority: 'medium',
        dueDate: '',
        estimatedHours: '',
        tags: []
      });
    } catch (error) {
      console.error('Error creating task:', error);
    }
  };

  const addTag = () => {
    if (newTag.trim() && !newTask.tags.includes(newTag.trim())) {
      setNewTask(prev => ({ ...prev, tags: [...prev.tags, newTag.trim()] }));
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove) => {
    setNewTask(prev => ({ ...prev, tags: prev.tags.filter(tag => tag !== tagToRemove) }));
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const isOverdue = (dueDate, status) => {
    return new Date(dueDate) < new Date() && status !== 'completed';
  };

  if (loading) {
    return (
      <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-lg p-6 animate-pulse">
        <div className="h-6 bg-white/20 rounded mb-4 w-1/3"></div>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white/10 rounded-lg p-4">
              <div className="h-4 bg-white/20 rounded mb-2 w-3/4"></div>
              <div className="h-3 bg-white/10 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-lg">
      {/* Header */}
      <div className="p-6 border-b border-white/20">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white flex items-center space-x-2">
            <CheckSquare className="h-5 w-5" />
            <span>Task Assignment</span>
            <span className="text-sm text-white/60 bg-white/20 px-2 py-1 rounded-full">
              {tasks.length}
            </span>
          </h2>
          
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center space-x-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-medium px-4 py-2 rounded-lg transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>New Task</span>
          </button>
        </div>
        
        {/* Search and Filters */}
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent"
            />
          </div>
          
          <div className="flex space-x-3 overflow-x-auto pb-1">
            {statusOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setFilterStatus(option.value)}
                className={`flex items-center space-x-2 px-3 py-1 rounded-full border text-sm font-medium whitespace-nowrap transition-all ${
                  filterStatus === option.value
                    ? 'bg-blue-500/30 text-blue-300 border-blue-400/40'
                    : 'bg-white/10 text-white/60 border-white/20 hover:bg-white/20'
                }`}
              >
                <span>{option.label}</span>
                <span className="bg-white/20 px-1.5 py-0.5 rounded text-xs">{option.count}</span>
              </button>
            ))}
          </div>
          
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-white/60" />
            <select
              value={filterAssignee}
              onChange={(e) => setFilterAssignee(e.target.value)}
              className="bg-white/10 border border-white/20 rounded text-white text-sm px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              {assigneeOptions.map(option => (
                <option key={option.value} value={option.value} className="bg-gray-800">
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tasks List */}
      <div className="p-6">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-8">
            <CheckSquare className="h-12 w-12 text-white/40 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No tasks found</h3>
            <p className="text-white/60">Try adjusting your search criteria or create a new task.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                className="bg-white/5 rounded-lg p-4 border border-white/10 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    {/* Task Header */}
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="font-semibold text-white truncate">{task.title}</h3>
                      
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(task.status)}`}>
                          {task.status.replace('-', ' ').toUpperCase()}
                        </span>
                        
                        <span className={`px-2 py-1 text-xs font-medium rounded-full bg-gradient-to-r ${getPriorityColor(task.priority)} text-white`}>
                          {task.priority.toUpperCase()}
                        </span>
                        
                        {isOverdue(task.dueDate, task.status) && (
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-500/20 text-red-400 border border-red-400/30">
                            OVERDUE
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <p className="text-sm text-white/70 mb-3 line-clamp-2">{task.description}</p>
                    
                    {/* Task Details */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-white/60">
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4" />
                        <span className={isOverdue(task.dueDate, task.status) ? 'text-red-400' : ''}>
                          Due {formatDate(task.dueDate)}
                        </span>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Clock className="h-4 w-4" />
                        <span>{task.estimatedHours}h estimated</span>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <User className="h-4 w-4" />
                        {task.assigneeId ? (
                          <div className="flex items-center space-x-1">
                            <div className="w-5 h-5 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                              {task.assigneeAvatar}
                            </div>
                            <span>{task.assigneeName}</span>
                          </div>
                        ) : (
                          <span className="text-orange-400">Unassigned</span>
                        )}
                      </div>
                    </div>
                    
                    {/* Tags */}
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
                  
                  {/* Actions */}
                  <div className="relative ml-4">
                    <button
                      onClick={() => setShowTaskActions(showTaskActions === task.id ? null : task.id)}
                      className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                    >
                      <MoreVertical className="h-4 w-4 text-white/60" />
                    </button>
                    
                    {showTaskActions === task.id && (
                      <div className="absolute right-0 top-full mt-1 bg-gray-800/95 backdrop-blur-md rounded-lg border border-white/20 shadow-xl z-10 min-w-40">
                        {!task.assigneeId ? (
                          <button
                            onClick={() => {
                              setShowAssignModal(task.id);
                              setShowTaskActions(null);
                            }}
                            className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
                          >
                            <UserPlus className="h-4 w-4" />
                            <span>Assign Task</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              onUnassignTask(task.id);
                              setShowTaskActions(null);
                            }}
                            className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-orange-400 hover:bg-orange-500/10 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span>Unassign</span>
                          </button>
                        )}
                        
                        <div className="border-t border-white/20 my-1"></div>
                        
                        {task.status !== 'completed' && (
                          <button
                            onClick={() => {
                              onUpdateTaskStatus(task.id, 'completed');
                              setShowTaskActions(null);
                            }}
                            className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-green-400 hover:bg-green-500/10 transition-colors"
                          >
                            <CheckSquare className="h-4 w-4" />
                            <span>Mark Complete</span>
                          </button>
                        )}
                        
                        {task.status === 'todo' && (
                          <button
                            onClick={() => {
                              onUpdateTaskStatus(task.id, 'in-progress');
                              setShowTaskActions(null);
                            }}
                            className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-blue-400 hover:bg-blue-500/10 transition-colors"
                          >
                            <Clock className="h-4 w-4" />
                            <span>Start Progress</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assignment Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-2xl w-full max-w-md">
            <div className="p-6">
              <h3 className="text-xl font-semibold text-white mb-4">Assign Task</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Assign to
                  </label>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {teamMembers.map((member) => (
                      <button
                        key={member.id}
                        onClick={() => handleAssignTask(showAssignModal, member.id)}
                        className="w-full flex items-center space-x-3 p-3 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-colors text-left"
                      >
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                          {member.avatar}
                        </div>
                        <div>
                          <div className="font-medium text-white">{member.name}</div>
                          <div className="text-sm text-white/60">{member.role}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Assignment Notes (Optional)
                  </label>
                  <textarea
                    value={assignmentNotes}
                    onChange={(e) => setAssignmentNotes(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                    placeholder="Add any notes or instructions for the assignee..."
                  />
                </div>
                
                <div className="flex space-x-3 pt-4">
                  <button
                    onClick={() => setShowAssignModal(null)}
                    className="flex-1 px-4 py-2 bg-white/10 text-white/80 border border-white/20 rounded-lg hover:bg-white/20 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-semibold text-white mb-6">Create New Task</h3>
              
              <form onSubmit={handleCreateTask} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Task Title *
                  </label>
                  <input
                    type="text"
                    value={newTask.title}
                    onChange={(e) => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                    required
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    placeholder="Enter task title"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Description *
                  </label>
                  <textarea
                    value={newTask.description}
                    onChange={(e) => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                    required
                    rows={3}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                    placeholder="Describe the task"
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Priority
                    </label>
                    <select
                      value={newTask.priority}
                      onChange={(e) => setNewTask(prev => ({ ...prev, priority: e.target.value }))}
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    >
                      <option value="low" className="bg-gray-800">Low</option>
                      <option value="medium" className="bg-gray-800">Medium</option>
                      <option value="high" className="bg-gray-800">High</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Due Date *
                    </label>
                    <input
                      type="date"
                      value={newTask.dueDate}
                      onChange={(e) => setNewTask(prev => ({ ...prev, dueDate: e.target.value }))}
                      required
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Estimated Hours
                    </label>
                    <input
                      type="number"
                      value={newTask.estimatedHours}
                      onChange={(e) => setNewTask(prev => ({ ...prev, estimatedHours: e.target.value }))}
                      min="1"
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      placeholder="Hours"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Tags
                  </label>
                  <div className="flex space-x-2 mb-2">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                      className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      placeholder="Add a tag"
                    />
                    <button
                      type="button"
                      onClick={addTag}
                      className="px-4 py-2 bg-blue-500/20 text-blue-400 border border-blue-400/30 rounded-lg hover:bg-blue-500/30 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  
                  {newTask.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {newTask.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center space-x-2 px-3 py-1 bg-white/10 text-white/80 border border-white/20 rounded-full text-sm"
                        >
                          <span>{tag}</span>
                          <button
                            type="button"
                            onClick={() => removeTag(tag)}
                            className="hover:text-red-400 transition-colors"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 px-4 py-2 bg-white/10 text-white/80 border border-white/20 rounded-lg hover:bg-white/20 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all"
                  >
                    Create Task
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskAssignment;