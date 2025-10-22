import { useState, useEffect, useCallback } from 'react';

const useTaskAssignment = () => {
  const [tasks, setTasks] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchTasks();
    fetchAssignments();
  }, []);

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      
      // TODO: Connect to the backend API when ready.
      // const response = await fetch('http://localhost:8000/api/team/tasks');
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
          dueDate: '2024-01-20',
          estimatedHours: 16,
          tags: ['backend', 'security'],
          assigneeId: 4,
          assigneeName: 'Alex Rodriguez',
          assigneeAvatar: 'AR',
          createdAt: '2024-01-10T09:00:00Z',
          updatedAt: '2024-01-15T14:30:00Z'
        },
        {
          id: 2,
          title: 'Design dashboard wireframes',
          description: 'Create wireframes and mockups for the main dashboard interface',
          priority: 'medium',
          status: 'completed',
          dueDate: '2024-01-18',
          estimatedHours: 12,
          tags: ['design', 'ui/ux'],
          assigneeId: 3,
          assigneeName: 'Emily Davis',
          assigneeAvatar: 'ED',
          createdAt: '2024-01-08T10:15:00Z',
          updatedAt: '2024-01-16T16:45:00Z'
        },
        {
          id: 3,
          title: 'Frontend component library',
          description: 'Build reusable React components for the design system',
          priority: 'high',
          status: 'in-progress',
          dueDate: '2024-01-25',
          estimatedHours: 24,
          tags: ['frontend', 'components'],
          assigneeId: 2,
          assigneeName: 'Mike Chen',
          assigneeAvatar: 'MC',
          createdAt: '2024-01-12T11:20:00Z',
          updatedAt: '2024-01-15T10:15:00Z'
        },
        {
          id: 4,
          title: 'API documentation',
          description: 'Write comprehensive API documentation for all endpoints',
          priority: 'medium',
          status: 'todo',
          dueDate: '2024-01-30',
          estimatedHours: 8,
          tags: ['documentation', 'api'],
          assigneeId: null,
          assigneeName: null,
          assigneeAvatar: null,
          createdAt: '2024-01-14T13:45:00Z',
          updatedAt: '2024-01-14T13:45:00Z'
        },
        {
          id: 5,
          title: 'Testing automation setup',
          description: 'Set up automated testing pipeline with Jest and Cypress',
          priority: 'high',
          status: 'in-progress',
          dueDate: '2024-01-22',
          estimatedHours: 20,
          tags: ['testing', 'automation'],
          assigneeId: 5,
          assigneeName: 'Lisa Park',
          assigneeAvatar: 'LP',
          createdAt: '2024-01-11T15:30:00Z',
          updatedAt: '2024-01-15T09:20:00Z'
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

  const fetchAssignments = useCallback(async () => {
    try {
      // TODO: Connect to the backend API when ready.
      // const response = await fetch('http://localhost:8000/api/team/assignments');
      // const data = await response.json();
      // setAssignments(data.assignments);

      // Using mock data for now
      const mockAssignments = [
        {
          id: 1,
          taskId: 1,
          assigneeId: 4,
          assignedBy: 1,
          assignedAt: '2024-01-10T09:00:00Z',
          notes: 'Priority task for the security module'
        },
        {
          id: 2,
          taskId: 2,
          assigneeId: 3,
          assignedBy: 1,
          assignedAt: '2024-01-08T10:15:00Z',
          notes: 'Focus on user experience and accessibility'
        },
        {
          id: 3,
          taskId: 3,
          assigneeId: 2,
          assignedBy: 1,
          assignedAt: '2024-01-12T11:20:00Z',
          notes: 'Coordinate with Emily for design consistency'
        },
        {
          id: 4,
          taskId: 5,
          assigneeId: 5,
          assignedBy: 1,
          assignedAt: '2024-01-11T15:30:00Z',
          notes: 'Set up CI/CD pipeline integration'
        }
      ];
      
      setAssignments(mockAssignments);
    } catch (err) {
      console.error('Error fetching assignments:', err);
    }
  }, []);

  const assignTask = useCallback(async (taskId, assigneeId, notes = '') => {
    try {
      // TODO: Connect to the backend API when ready.
      // const response = await fetch('http://localhost:8000/api/team/assignments', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ taskId, assigneeId, notes })
      // });
      // const assignment = await response.json();

      // Using mock data for now
      const assignment = {
        id: Date.now(),
        taskId,
        assigneeId,
        assignedBy: 1, // Current user
        assignedAt: new Date().toISOString(),
        notes
      };
      
      setAssignments(prev => [...prev, assignment]);
      
      // Update task with assignee info
      setTasks(prev => prev.map(task => {
        if (task.id === taskId) {
          // Find assignee info (this would come from team members in real app)
          const assigneeMap = {
            1: { name: 'Sarah Johnson', avatar: 'SJ' },
            2: { name: 'Mike Chen', avatar: 'MC' },
            3: { name: 'Emily Davis', avatar: 'ED' },
            4: { name: 'Alex Rodriguez', avatar: 'AR' },
            5: { name: 'Lisa Park', avatar: 'LP' }
          };
          const assignee = assigneeMap[assigneeId];
          
          return {
            ...task,
            assigneeId,
            assigneeName: assignee?.name,
            assigneeAvatar: assignee?.avatar,
            status: 'assigned',
            updatedAt: new Date().toISOString()
          };
        }
        return task;
      }));
      
      return assignment;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const unassignTask = useCallback(async (taskId) => {
    try {
      // TODO: Connect to the backend API when ready.
      // await fetch(`http://localhost:8000/api/team/assignments/task/${taskId}`, {
      //   method: 'DELETE'
      // });

      setAssignments(prev => prev.filter(assignment => assignment.taskId !== taskId));
      
      setTasks(prev => prev.map(task => {
        if (task.id === taskId) {
          return {
            ...task,
            assigneeId: null,
            assigneeName: null,
            assigneeAvatar: null,
            status: 'todo',
            updatedAt: new Date().toISOString()
          };
        }
        return task;
      }));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const updateTaskStatus = useCallback(async (taskId, status) => {
    try {
      // TODO: Connect to the backend API when ready.
      // await fetch(`http://localhost:8000/api/team/tasks/${taskId}/status`, {
      //   method: 'PUT',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ status })
      // });

      setTasks(prev => prev.map(task => 
        task.id === taskId 
          ? { ...task, status, updatedAt: new Date().toISOString() }
          : task
      ));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const createTask = useCallback(async (taskData) => {
    try {
      // TODO: Connect to the backend API when ready.
      // const response = await fetch('http://localhost:8000/api/team/tasks', {
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
        assigneeId: null,
        assigneeName: null,
        assigneeAvatar: null,
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

  return {
    tasks,
    assignments,
    loading,
    error,
    assignTask,
    unassignTask,
    updateTaskStatus,
    createTask
  };
};

export default useTaskAssignment;