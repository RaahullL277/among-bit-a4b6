import { useState, useEffect, useCallback } from 'react';

const useTasks = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('priority');

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      
      // TODO: Connect to the backend API when ready.
      // const response = await fetch('http://localhost:8000/api/tasks');
      // const data = await response.json();
      // setTasks(data.tasks);

      // Using mock data for now
      const mockTasks = [
        {
          id: 1,
          title: 'Implement user authentication',
          description: 'Set up JWT authentication with login and register endpoints',
          priority: 'high',
          status: 'in-progress',
          dueDate: '2024-01-15',
          tags: ['backend', 'security'],
          assignee: 'John Doe',
          createdAt: '2024-01-10T09:00:00Z',
          updatedAt: '2024-01-12T14:30:00Z'
        },
        {
          id: 2,
          title: 'Design dashboard layout',
          description: 'Create wireframes and mockups for the main dashboard interface',
          priority: 'medium',
          status: 'completed',
          dueDate: '2024-01-12',
          tags: ['design', 'ui/ux'],
          assignee: 'Jane Smith',
          createdAt: '2024-01-08T10:15:00Z',
          updatedAt: '2024-01-11T16:45:00Z'
        },
        {
          id: 3,
          title: 'Database optimization',
          description: 'Optimize database queries and add proper indexing',
          priority: 'high',
          status: 'todo',
          dueDate: '2024-01-20',
          tags: ['backend', 'database'],
          assignee: 'Mike Johnson',
          createdAt: '2024-01-11T11:20:00Z',
          updatedAt: '2024-01-11T11:20:00Z'
        },
        {
          id: 4,
          title: 'Write unit tests',
          description: 'Add comprehensive unit tests for all components',
          priority: 'medium',
          status: 'in-progress',
          dueDate: '2024-01-18',
          tags: ['testing', 'quality'],
          assignee: 'Sarah Wilson',
          createdAt: '2024-01-09T13:45:00Z',
          updatedAt: '2024-01-12T10:15:00Z'
        },
        {
          id: 5,
          title: 'Update documentation',
          description: 'Update API documentation and user guides',
          priority: 'low',
          status: 'todo',
          dueDate: '2024-01-25',
          tags: ['documentation'],
          assignee: 'Alex Brown',
          createdAt: '2024-01-10T15:30:00Z',
          updatedAt: '2024-01-10T15:30:00Z'
        }
      ];
      
      setTimeout(() => {
        setTasks(mockTasks);
        setLoading(false);
      }, 1000);
      
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, []);

  const addTask = useCallback(async (taskData) => {
    try {
      // TODO: Connect to the backend API when ready.
      // const response = await fetch('http://localhost:8000/api/tasks', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(taskData)
      // });
      // const newTask = await response.json();

      // Using mock data for now
      const newTask = {
        id: Date.now(),
        ...taskData,
        status: 'todo',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      setTasks(prev => [newTask, ...prev]);
      return newTask;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const updateTask = useCallback(async (taskId, updates) => {
    try {
      // TODO: Connect to the backend API when ready.
      // const response = await fetch(`http://localhost:8000/api/tasks/${taskId}`, {
      //   method: 'PUT',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(updates)
      // });
      // const updatedTask = await response.json();

      // Using mock data for now
      const updatedTask = {
        ...tasks.find(t => t.id === taskId),
        ...updates,
        updatedAt: new Date().toISOString()
      };
      
      setTasks(prev => prev.map(task => 
        task.id === taskId ? updatedTask : task
      ));
      return updatedTask;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [tasks]);

  const deleteTask = useCallback(async (taskId) => {
    try {
      // TODO: Connect to the backend API when ready.
      // await fetch(`http://localhost:8000/api/tasks/${taskId}`, {
      //   method: 'DELETE'
      // });

      setTasks(prev => prev.filter(task => task.id !== taskId));
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const filteredAndSortedTasks = tasks
    .filter(task => {
      if (filter === 'all') return true;
      return task.status === filter;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'priority':
          const priorityOrder = { high: 3, medium: 2, low: 1 };
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        case 'dueDate':
          return new Date(a.dueDate) - new Date(b.dueDate);
        case 'status':
          return a.status.localeCompare(b.status);
        case 'title':
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  return {
    tasks: filteredAndSortedTasks,
    allTasks: tasks,
    loading,
    error,
    filter,
    setFilter,
    sortBy,
    setSortBy,
    addTask,
    updateTask,
    deleteTask,
    refetch: fetchTasks
  };
};

export default useTasks;