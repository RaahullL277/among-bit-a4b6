import { useState, useEffect, useCallback } from 'react';

const useDashboard = () => {
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      
      // TODO: Connect to the backend API when ready.
      // const response = await fetch('http://localhost:8000/api/dashboard');
      // const data = await response.json();
      // setDashboardData(data);

      // Using mock data for now
      const mockData = {
        overview: {
          totalTasks: 247,
          completedTasks: 189,
          activeProjects: 12,
          teamMembers: 8
        },
        analytics: {
          weeklyProgress: [
            { day: 'Mon', tasks: 23, completed: 18 },
            { day: 'Tue', tasks: 31, completed: 25 },
            { day: 'Wed', tasks: 28, completed: 22 },
            { day: 'Thu', tasks: 35, completed: 29 },
            { day: 'Fri', tasks: 42, completed: 38 },
            { day: 'Sat', tasks: 15, completed: 12 },
            { day: 'Sun', tasks: 8, completed: 6 }
          ],
          monthlyStats: [
            { month: 'Jan', value: 65 },
            { month: 'Feb', value: 78 },
            { month: 'Mar', value: 82 },
            { month: 'Apr', value: 91 },
            { month: 'May', value: 87 },
            { month: 'Jun', value: 95 }
          ]
        },
        teamProgress: [
          { id: 1, name: 'Sarah Johnson', avatar: 'SJ', progress: 92, tasksCompleted: 28, role: 'Frontend Developer' },
          { id: 2, name: 'Mike Chen', avatar: 'MC', progress: 87, tasksCompleted: 24, role: 'Backend Developer' },
          { id: 3, name: 'Emily Davis', avatar: 'ED', progress: 94, tasksCompleted: 31, role: 'UI/UX Designer' },
          { id: 4, name: 'Alex Rodriguez', avatar: 'AR', progress: 78, tasksCompleted: 19, role: 'Project Manager' },
          { id: 5, name: 'Lisa Park', avatar: 'LP', progress: 89, tasksCompleted: 26, role: 'QA Engineer' }
        ],
        usageStats: {
          calendarUsage: {
            daily: 85,
            weekly: 72,
            monthly: 94
          },
          taskCreation: {
            thisWeek: 45,
            lastWeek: 38,
            growth: 18.4
          },
          teamCollaboration: {
            messages: 1247,
            meetings: 23,
            sharedFiles: 156
          },
          productivity: {
            focusTime: '6h 32m',
            breakTime: '1h 45m',
            efficiency: 87
          }
        }
      };
      
      setTimeout(() => {
        setDashboardData(mockData);
        setLoading(false);
      }, 1000);
      
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  return { dashboardData, loading, error, refetch: fetchDashboardData };
};

export default useDashboard;