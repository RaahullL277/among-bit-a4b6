import { useState, useEffect, useCallback } from 'react';

const useNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchNotifications();
  }, []);

  useEffect(() => {
    const count = notifications.filter(n => !n.read).length;
    setUnreadCount(count);
  }, [notifications]);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      
      // TODO: Connect to the backend API when ready.
      // const response = await fetch('http://localhost:8000/api/notifications');
      // const data = await response.json();
      // setNotifications(data.notifications);

      // Using mock data for now
      const mockNotifications = [
        {
          id: 1,
          type: 'task_completed',
          title: 'Task Completed',
          message: 'Mike Chen completed "Frontend component library"',
          timestamp: new Date(Date.now() - 5 * 60 * 1000),
          read: false,
          priority: 'medium',
          actionUrl: '/tasks',
          avatar: 'MC',
          metadata: {
            taskId: 3,
            userId: 2,
            userName: 'Mike Chen'
          }
        },
        {
          id: 2,
          type: 'calendar_event',
          title: 'Meeting Reminder',
          message: 'Team standup meeting starts in 15 minutes',
          timestamp: new Date(Date.now() - 15 * 60 * 1000),
          read: false,
          priority: 'high',
          actionUrl: '/calendar',
          avatar: '📅',
          metadata: {
            eventId: 'evt_123',
            meetingRoom: 'Conference Room A'
          }
        },
        {
          id: 3,
          type: 'team_message',
          title: 'New Team Message',
          message: 'Emily Davis shared new design mockups in the team chat',
          timestamp: new Date(Date.now() - 30 * 60 * 1000),
          read: false,
          priority: 'low',
          actionUrl: '/collaboration',
          avatar: 'ED',
          metadata: {
            messageId: 'msg_456',
            userId: 3,
            userName: 'Emily Davis'
          }
        },
        {
          id: 4,
          type: 'task_assigned',
          title: 'Task Assigned',
          message: 'You have been assigned "API documentation" by Sarah Johnson',
          timestamp: new Date(Date.now() - 60 * 60 * 1000),
          read: true,
          priority: 'medium',
          actionUrl: '/tasks',
          avatar: 'SJ',
          metadata: {
            taskId: 4,
            assignedBy: 1,
            assignedByName: 'Sarah Johnson'
          }
        },
        {
          id: 5,
          type: 'calendar_updated',
          title: 'Calendar Updated',
          message: 'Project review meeting has been rescheduled to tomorrow 2:00 PM',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
          read: true,
          priority: 'medium',
          actionUrl: '/calendar',
          avatar: '📅',
          metadata: {
            eventId: 'evt_789',
            newTime: '2024-01-17T14:00:00Z'
          }
        },
        {
          id: 6,
          type: 'task_overdue',
          title: 'Task Overdue',
          message: '"Database optimization" task is overdue by 2 days',
          timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000),
          read: false,
          priority: 'high',
          actionUrl: '/tasks',
          avatar: '⚠️',
          metadata: {
            taskId: 3,
            daysOverdue: 2
          }
        },
        {
          id: 7,
          type: 'team_member_joined',
          title: 'New Team Member',
          message: 'Alex Rodriguez has joined the Engineering team',
          timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
          read: true,
          priority: 'low',
          actionUrl: '/collaboration',
          avatar: 'AR',
          metadata: {
            userId: 4,
            userName: 'Alex Rodriguez',
            department: 'Engineering'
          }
        },
        {
          id: 8,
          type: 'system_update',
          title: 'System Update',
          message: 'Application will undergo maintenance tonight from 2:00 AM to 4:00 AM',
          timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000),
          read: false,
          priority: 'medium',
          actionUrl: null,
          avatar: '🔧',
          metadata: {
            maintenanceStart: '2024-01-17T02:00:00Z',
            maintenanceEnd: '2024-01-17T04:00:00Z'
          }
        }
      ];
      
      setTimeout(() => {
        setNotifications(mockNotifications);
        setLoading(false);
      }, 1000);
      
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, []);

  const markAsRead = useCallback(async (notificationId) => {
    try {
      // TODO: Connect to the backend API when ready.
      // await fetch(`http://localhost:8000/api/notifications/${notificationId}/read`, {
      //   method: 'PUT'
      // });

      setNotifications(prev => prev.map(notification => 
        notification.id === notificationId 
          ? { ...notification, read: true }
          : notification
      ));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      // TODO: Connect to the backend API when ready.
      // await fetch('http://localhost:8000/api/notifications/mark-all-read', {
      //   method: 'PUT'
      // });

      setNotifications(prev => prev.map(notification => 
        ({ ...notification, read: true })
      ));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const deleteNotification = useCallback(async (notificationId) => {
    try {
      // TODO: Connect to the backend API when ready.
      // await fetch(`http://localhost:8000/api/notifications/${notificationId}`, {
      //   method: 'DELETE'
      // });

      setNotifications(prev => prev.filter(notification => 
        notification.id !== notificationId
      ));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const snoozeNotification = useCallback(async (notificationId, snoozeUntil) => {
    try {
      // TODO: Connect to the backend API when ready.
      // await fetch(`http://localhost:8000/api/notifications/${notificationId}/snooze`, {
      //   method: 'PUT',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ snoozeUntil })
      // });

      setNotifications(prev => prev.map(notification => 
        notification.id === notificationId 
          ? { ...notification, snoozedUntil: snoozeUntil }
          : notification
      ));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const filteredNotifications = notifications.filter(notification => {
    if (filter === 'unread') return !notification.read;
    if (filter === 'read') return notification.read;
    if (filter !== 'all') return notification.type === filter;
    return true;
  }).filter(notification => {
    // Hide snoozed notifications that are still snoozed
    if (notification.snoozedUntil) {
      return new Date(notification.snoozedUntil) <= new Date();
    }
    return true;
  });

  return {
    notifications: filteredNotifications,
    allNotifications: notifications,
    unreadCount,
    loading,
    error,
    filter,
    setFilter,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    snoozeNotification
  };
};

export default useNotifications;