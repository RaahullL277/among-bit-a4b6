import React, { useState } from 'react';
import { X, Plus, Tag, Calendar, User, AlertCircle, CheckCircle } from 'lucide-react';
import useTaskForm from '../hooks/useTaskForm';

const TaskEditor = ({ task, onSave, onCancel, isOpen }) => {
  const [newTag, setNewTag] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const {
    formData,
    errors,
    isSubmitting,
    handleChange,
    handleTagsChange,
    handleSubmit
  } = useTaskForm(task);

  const addTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      handleTagsChange([...formData.tags, newTag.trim()]);
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove) => {
    handleTagsChange(formData.tags.filter(tag => tag !== tagToRemove));
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const success = await handleSubmit(onSave);
    if (success) {
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        onCancel();
      }, 1500);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/20">
          <h2 className="text-2xl font-semibold text-white">
            {task ? 'Edit Task' : 'Create New Task'}
          </h2>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-white/60" />
          </button>
        </div>

        {/* Success Message */}
        {showSuccess && (
          <div className="mx-6 mt-6 p-4 bg-green-500/20 border border-green-400/30 rounded-lg flex items-center space-x-2">
            <CheckCircle className="h-5 w-5 text-green-400" />
            <span className="text-green-400 font-medium">
              Task {task ? 'updated' : 'created'} successfully!
            </span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={onSubmit} className="p-6 space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Task Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              className={`w-full px-4 py-3 bg-white/10 border rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 transition-colors ${
                errors.title 
                  ? 'border-red-400/50 focus:ring-red-500/50' 
                  : 'border-white/20 focus:ring-blue-500/50 focus:border-transparent'
              }`}
              placeholder="Enter task title..."
            />
            {errors.title && (
              <div className="flex items-center space-x-2 mt-2 text-red-400 text-sm">
                <AlertCircle className="h-4 w-4" />
                <span>{errors.title}</span>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Description *
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={4}
              className={`w-full px-4 py-3 bg-white/10 border rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 resize-none transition-colors ${
                errors.description 
                  ? 'border-red-400/50 focus:ring-red-500/50' 
                  : 'border-white/20 focus:ring-blue-500/50 focus:border-transparent'
              }`}
              placeholder="Describe the task in detail..."
            />
            {errors.description && (
              <div className="flex items-center space-x-2 mt-2 text-red-400 text-sm">
                <AlertCircle className="h-4 w-4" />
                <span>{errors.description}</span>
              </div>
            )}
          </div>

          {/* Priority and Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                Priority *
              </label>
              <select
                value={formData.priority}
                onChange={(e) => handleChange('priority', e.target.value)}
                className={`w-full px-4 py-3 bg-white/10 border rounded-lg text-white focus:outline-none focus:ring-2 transition-colors ${
                  errors.priority 
                    ? 'border-red-400/50 focus:ring-red-500/50' 
                    : 'border-white/20 focus:ring-blue-500/50 focus:border-transparent'
                }`}
              >
                <option value="low" className="bg-gray-800">Low Priority</option>
                <option value="medium" className="bg-gray-800">Medium Priority</option>
                <option value="high" className="bg-gray-800">High Priority</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                Status *
              </label>
              <select
                value={formData.status}
                onChange={(e) => handleChange('status', e.target.value)}
                className={`w-full px-4 py-3 bg-white/10 border rounded-lg text-white focus:outline-none focus:ring-2 transition-colors ${
                  errors.status 
                    ? 'border-red-400/50 focus:ring-red-500/50' 
                    : 'border-white/20 focus:ring-blue-500/50 focus:border-transparent'
                }`}
              >
                <option value="todo" className="bg-gray-800">To Do</option>
                <option value="in-progress" className="bg-gray-800">In Progress</option>
                <option value="completed" className="bg-gray-800">Completed</option>
              </select>
            </div>
          </div>

          {/* Due Date and Assignee */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2 flex items-center space-x-2">
                <Calendar className="h-4 w-4" />
                <span>Due Date *</span>
              </label>
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) => handleChange('dueDate', e.target.value)}
                className={`w-full px-4 py-3 bg-white/10 border rounded-lg text-white focus:outline-none focus:ring-2 transition-colors ${
                  errors.dueDate 
                    ? 'border-red-400/50 focus:ring-red-500/50' 
                    : 'border-white/20 focus:ring-blue-500/50 focus:border-transparent'
                }`}
              />
              {errors.dueDate && (
                <div className="flex items-center space-x-2 mt-2 text-red-400 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  <span>{errors.dueDate}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-2 flex items-center space-x-2">
                <User className="h-4 w-4" />
                <span>Assignee *</span>
              </label>
              <input
                type="text"
                value={formData.assignee}
                onChange={(e) => handleChange('assignee', e.target.value)}
                className={`w-full px-4 py-3 bg-white/10 border rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 transition-colors ${
                  errors.assignee 
                    ? 'border-red-400/50 focus:ring-red-500/50' 
                    : 'border-white/20 focus:ring-blue-500/50 focus:border-transparent'
                }`}
                placeholder="Enter assignee name..."
              />
              {errors.assignee && (
                <div className="flex items-center space-x-2 mt-2 text-red-400 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  <span>{errors.assignee}</span>
                </div>
              )}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2 flex items-center space-x-2">
              <Tag className="h-4 w-4" />
              <span>Tags</span>
            </label>
            
            {/* Tag Input */}
            <div className="flex space-x-2 mb-3">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={handleKeyPress}
                className="flex-1 px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent"
                placeholder="Add a tag..."
              />
              <button
                type="button"
                onClick={addTag}
                disabled={!newTag.trim() || formData.tags.includes(newTag.trim())}
                className="px-4 py-2 bg-blue-500/20 text-blue-400 border border-blue-400/30 rounded-lg hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
              >
                <Plus className="h-4 w-4" />
                <span>Add</span>
              </button>
            </div>
            
            {/* Tag List */}
            {formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.tags.map((tag, index) => (
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
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex justify-end space-x-4 pt-6 border-t border-white/20">
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-2 bg-white/10 text-white/80 border border-white/20 rounded-lg hover:bg-white/20 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center space-x-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Saving...</span>
                </>
              ) : (
                <span>{task ? 'Update Task' : 'Create Task'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskEditor;