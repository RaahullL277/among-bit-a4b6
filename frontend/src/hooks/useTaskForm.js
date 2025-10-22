import { useState, useCallback } from 'react';

const useTaskForm = (initialTask = null) => {
  const [formData, setFormData] = useState({
    title: initialTask?.title || '',
    description: initialTask?.description || '',
    priority: initialTask?.priority || 'medium',
    status: initialTask?.status || 'todo',
    dueDate: initialTask?.dueDate || '',
    tags: initialTask?.tags || [],
    assignee: initialTask?.assignee || ''
  });
  
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateForm = useCallback(() => {
    const newErrors = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    } else if (formData.title.length < 3) {
      newErrors.title = 'Title must be at least 3 characters long';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    } else if (formData.description.length < 10) {
      newErrors.description = 'Description must be at least 10 characters long';
    }

    if (!formData.dueDate) {
      newErrors.dueDate = 'Due date is required';
    } else if (new Date(formData.dueDate) < new Date().setHours(0, 0, 0, 0)) {
      newErrors.dueDate = 'Due date cannot be in the past';
    }

    if (!formData.assignee.trim()) {
      newErrors.assignee = 'Assignee is required';
    }

    if (!['low', 'medium', 'high'].includes(formData.priority)) {
      newErrors.priority = 'Please select a valid priority';
    }

    if (!['todo', 'in-progress', 'completed'].includes(formData.status)) {
      newErrors.status = 'Please select a valid status';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  }, [errors]);

  const handleTagsChange = useCallback((tags) => {
    setFormData(prev => ({ ...prev, tags }));
  }, []);

  const handleSubmit = useCallback(async (onSubmit) => {
    if (!validateForm()) {
      return false;
    }

    setIsSubmitting(true);
    
    try {
      await onSubmit(formData);
      
      // Reset form after successful submission
      if (!initialTask) {
        setFormData({
          title: '',
          description: '',
          priority: 'medium',
          status: 'todo',
          dueDate: '',
          tags: [],
          assignee: ''
        });
      }
      
      return true;
    } catch (error) {
      console.error('Form submission error:', error);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, validateForm, initialTask]);

  const resetForm = useCallback(() => {
    setFormData({
      title: initialTask?.title || '',
      description: initialTask?.description || '',
      priority: initialTask?.priority || 'medium',
      status: initialTask?.status || 'todo',
      dueDate: initialTask?.dueDate || '',
      tags: initialTask?.tags || [],
      assignee: initialTask?.assignee || ''
    });
    setErrors({});
  }, [initialTask]);

  return {
    formData,
    errors,
    isSubmitting,
    handleChange,
    handleTagsChange,
    handleSubmit,
    resetForm,
    isValid: Object.keys(errors).length === 0 && formData.title.trim() !== ''
  };
};

export default useTaskForm;