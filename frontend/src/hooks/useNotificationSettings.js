import { useState, useEffect, useCallback } from 'react';

const useNotificationSettings = () => {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      
      // TODO: Connect to the backend API when ready.
      // const response = await fetch('http://localhost:8000/api/notifications/settings');
      // const data = await response.json();
      // setSettings(data.settings);

      // Using mock data for now
      const mockSettings = {
        general: {
          enableNotifications: true,
          enableSounds: true,
          enableDesktopNotifications: true,
          enableEmailNotifications: false,
          quietHoursEnabled: true,
          quietHoursStart: '22:00',
          quietHoursEnd: '08:00'
        },
        taskNotifications: {
          taskAssigned: true,
          taskCompleted: true,
          taskOverdue: true,
          taskCommented: false,
          taskStatusChanged: true
        },
        calendarNotifications: {
          eventReminders: true,
          eventUpdated: true,
          eventCancelled: true,
          dailyAgenda: true,
          weeklyAgenda: false
        },
        teamNotifications: {
          newMessages: true,
          mentions: true,
          teamMemberJoined: false,
          teamMemberLeft: false,
          projectUpdates: true
        },
        reminderSettings: {
          defaultReminderTime: 15,
          taskDeadlineReminder: 24,
          meetingReminder: 15,
          enableSmartReminders: true
        }
      };
      
      setTimeout(() => {
        setSettings(mockSettings);
        setLoading(false);
      }, 800);
      
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, []);

  const updateSettings = useCallback(async (category, key, value) => {
    try {
      setSaving(true);
      
      // TODO: Connect to the backend API when ready.
      // await fetch('http://localhost:8000/api/notifications/settings', {
      //   method: 'PUT',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ category, key, value })
      // });

      setSettings(prev => ({
        ...prev,
        [category]: {
          ...prev[category],
          [key]: value
        }
      }));
      
      setTimeout(() => setSaving(false), 500);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }, []);

  const resetToDefaults = useCallback(async () => {
    try {
      setSaving(true);
      
      // TODO: Connect to the backend API when ready.
      // await fetch('http://localhost:8000/api/notifications/settings/reset', {
      //   method: 'POST'
      // });

      // Reset to default settings
      const defaultSettings = {
        general: {
          enableNotifications: true,
          enableSounds: true,
          enableDesktopNotifications: true,
          enableEmailNotifications: false,
          quietHoursEnabled: false,
          quietHoursStart: '22:00',
          quietHoursEnd: '08:00'
        },
        taskNotifications: {
          taskAssigned: true,
          taskCompleted: true,
          taskOverdue: true,
          taskCommented: true,
          taskStatusChanged: true
        },
        calendarNotifications: {
          eventReminders: true,
          eventUpdated: true,
          eventCancelled: true,
          dailyAgenda: true,
          weeklyAgenda: true
        },
        teamNotifications: {
          newMessages: true,
          mentions: true,
          teamMemberJoined: true,
          teamMemberLeft: false,
          projectUpdates: true
        },
        reminderSettings: {
          defaultReminderTime: 15,
          taskDeadlineReminder: 24,
          meetingReminder: 15,
          enableSmartReminders: true
        }
      };
      
      setTimeout(() => {
        setSettings(defaultSettings);
        setSaving(false);
      }, 500);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }, []);

  const testNotification = useCallback(async (type) => {
    try {
      // TODO: Connect to the backend API when ready.
      // await fetch('http://localhost:8000/api/notifications/test', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ type })
      // });

      // Mock test notification
      if (settings.general?.enableDesktopNotifications && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification('Test Notification', {
            body: `This is a test ${type} notification`,
            icon: '/favicon.ico'
          });
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
              new Notification('Test Notification', {
                body: `This is a test ${type} notification`,
                icon: '/favicon.ico'
              });
            }
          });
        }
      }
    } catch (err) {
      setError(err.message);
    }
  }, [settings]);

  return {
    settings,
    loading,
    error,
    saving,
    updateSettings,
    resetToDefaults,
    testNotification
  };
};

export default useNotificationSettings;