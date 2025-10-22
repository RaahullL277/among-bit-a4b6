import React, { useState } from 'react';
import { Plus, Search, RefreshCw, CheckSquare, AlertCircle, Calendar, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import useTasks from '../hooks/useTasks';
import TaskList from '../components/TaskList';
import TaskEditor from '../components/TaskEditor';
import PrioritySorter from '../components/PrioritySorter';

const TaskManager = () => {
  const {
    tasks,
    allTasks,
    loading,
    error,
    filter,
    setFilter,
    sortBy,
    setSortBy,
    addTask,
    updateTask,
    deleteTask
  } = useTasks();

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);

  // Filter tasks by search query
  const filteredTasks = tasks.filter(task => {
    const searchLower = searchQuery.toLowerCase();
    return (
      task.title.toLowerCase().includes(searchLower) ||
      task.description.toLowerCase().includes(searchLower) ||
      task.assignee.toLowerCase().includes(searchLower) ||
      task.tags.some(tag => tag.toLowerCase().includes(searchLower))
    );
  });

  const handleCreateTask = () => {
    setEditingTask(null);
    setIsEditorOpen(true);
  };

  const handleEditTask = (task) => {
    setEditingTask(task);
    setIsEditorOpen(true);
  };

  const handleSaveTask = async (taskData) => {
    try {
      if (editingTask) {
        await updateTask(editingTask.id, taskData);
      } else {
        await addTask(taskData);
      }
      setIsEditorOpen(false);
      setEditingTask(null);
    } catch (error) {
      console.error('Error saving task:', error);
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (showDeleteConfirm === taskId) {
      try {
        await deleteTask(taskId);
        setShowDeleteConfirm(null);
      } catch (error) {
        console.error('Error deleting task:', error);
      }
    } else {
      setShowDeleteConfirm(taskId);
      setTimeout(() => setShowDeleteConfirm(null), 3000); // Auto-cancel after 3 seconds
    }
  };

  const handleCancelEditor = () => {
    setIsEditorOpen(false);
    setEditingTask(null);
  };

  const getTaskStats = () => {
    const total = allTasks.length;
    const completed = allTasks.filter(t => t.status === 'completed').length;
    const overdue = allTasks.filter(t => {
      const dueDate = new Date(t.dueDate);
      const today = new Date();
      return dueDate < today && t.status !== 'completed';
    }).length;
    const highPriority = allTasks.filter(t => t.priority === 'high' && t.status !== 'completed').length;
    
    return { total, completed, overdue, highPriority };
  };

  const stats = getTaskStats();

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="bg-red-500/10 backdrop-blur-md rounded-xl p-8 border border-red-400/20 text-center max-w-md">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <div className="text-red-400 text-lg font-semibold mb-2">Error Loading Tasks</div>
          <div className="text-red-300 text-sm mb-4">{error}</div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-400/30 rounded-lg hover:bg-red-500/30 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900">
      {/* Header */}
      <header className="bg-white/10 backdrop-blur-md border-b border-white/20 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg">
                  <CheckSquare className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">Task Manager</h1>
                  <p className="text-sm text-white/60">Organize and track your tasks</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tasks..."
                  className="pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent w-64"
                />
              </div>
              
              <button
                onClick={() => window.location.reload()}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title="Refresh tasks"
              >
                <RefreshCw className={`h-5 w-5 text-white/70 ${loading ? 'animate-spin' : ''}`} />
              </button>
              
              <button
                onClick={handleCreateTask}
                className="flex items-center space-x-2 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 px-4 py-2 rounded-lg text-white font-medium transition-all"
              >
                <Plus className="h-4 w-4" />
                <span>New Task</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg">
            <div className="flex items-center space-x-3 mb-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <CheckSquare className="h-5 w-5 text-blue-400" />
              </div>
              <span className="text-sm font-medium text-white/70">Total Tasks</span>
            </div>
            <div className="text-3xl font-bold text-white mb-1">{stats.total}</div>
            <div className="text-sm text-blue-400">All tasks</div>
          </div>
          
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg">
            <div className="flex items-center space-x-3 mb-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <CheckSquare className="h-5 w-5 text-green-400" />
              </div>
              <span className="text-sm font-medium text-white/70">Completed</span>
            </div>
            <div className="text-3xl font-bold text-white mb-1">{stats.completed}</div>
            <div className="text-sm text-green-400">
              {stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}% completion
            </div>
          </div>
          
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg">
            <div className="flex items-center space-x-3 mb-3">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <AlertCircle className="h-5 w-5 text-red-400" />
              </div>
              <span className="text-sm font-medium text-white/70">High Priority</span>
            </div>
            <div className="text-3xl font-bold text-white mb-1">{stats.highPriority}</div>
            <div className="text-sm text-red-400">Needs attention</div>
          </div>
          
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg">
            <div className="flex items-center space-x-3 mb-3">
              <div className="p-2 bg-orange-500/20 rounded-lg">
                <Calendar className="h-5 w-5 text-orange-400" />
              </div>
              <span className="text-sm font-medium text-white/70">Overdue</span>
            </div>
            <div className="text-3xl font-bold text-white mb-1">{stats.overdue}</div>
            <div className="text-sm text-orange-400">Past due date</div>
          </div>
        </div>

        {/* Main Task Management */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          {/* Priority Sorter - Sidebar */}
          <div className="xl:col-span-1">
            <PrioritySorter
              filter={filter}
              sortBy={sortBy}
              onFilterChange={setFilter}
              onSortChange={setSortBy}
              tasks={allTasks}
            />
          </div>
          
          {/* Task List - Main Content */}
          <div className="xl:col-span-3">
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    {filter === 'all' ? 'All Tasks' : `${filter.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())} Tasks`}
                  </h2>
                  <p className="text-white/60">
                    {searchQuery ? (
                      <>Showing {filteredTasks.length} of {tasks.length} tasks matching "{searchQuery}"</>
                    ) : (
                      <>Showing {filteredTasks.length} tasks sorted by {sortBy.replace(/([A-Z])/g, ' $1').toLowerCase()}</>
                    )}
                  </p>
                </div>
                
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="px-3 py-1 text-sm bg-white/10 text-white/70 border border-white/20 rounded-lg hover:bg-white/20 transition-colors"
                  >
                    Clear Search
                  </button>
                )}
              </div>
            </div>
            
            <TaskList
              tasks={filteredTasks}
              onEditTask={handleEditTask}
              onDeleteTask={handleDeleteTask}
              onUpdateTask={updateTask}
              loading={loading}
            />
          </div>
        </div>

        {/* Delete Confirmation */}
        {showDeleteConfirm && (
          <div className="fixed bottom-4 right-4 bg-red-500/90 backdrop-blur-md text-white p-4 rounded-lg border border-red-400/30 shadow-lg z-50">
            <div className="flex items-center space-x-3">
              <AlertCircle className="h-5 w-5 text-red-200" />
              <div>
                <p className="font-medium">Delete task?</p>
                <p className="text-sm text-red-200">This action cannot be undone.</p>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleDeleteTask(showDeleteConfirm)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
                >
                  Delete
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="px-3 py-1 bg-white/20 hover:bg-white/30 text-white text-sm rounded transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Task Editor Modal */}
      <TaskEditor
        task={editingTask}
        onSave={handleSaveTask}
        onCancel={handleCancelEditor}
        isOpen={isEditorOpen}
      />
    </div>
  );
};

export default TaskManager;