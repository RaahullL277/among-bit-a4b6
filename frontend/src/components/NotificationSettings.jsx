import React, { useState } from 'react';
import { Settings, Bell, Volume2, Mail, Clock, Smartphone, Save, RotateCcw, TestTube } from 'lucide-react';

const NotificationSettings = ({ settings, onUpdateSettings, onResetToDefaults, onTestNotification, loading, saving }) => {
  const [activeSection, setActiveSection] = useState('general');
  const [showSuccess, setShowSuccess] = useState(false);

  const sections = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'taskNotifications', label: 'Tasks', icon: Bell },
    { id: 'calendarNotifications', label: 'Calendar', icon: Clock },
    { id: 'teamNotifications', label: 'Team', icon: Smartphone },
    { id: 'reminderSettings', label: 'Reminders', icon: Volume2 }
  ];

  const handleSettingChange = async (category, key, value) => {
    await onUpdateSettings(category, key, value);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2000);
  };

  const handleTestNotification = async () => {
    await onTestNotification('general');
  };

  const handleReset = async () => {
    if (window.confirm('Are you sure you want to reset all notification settings to defaults?')) {
      await onResetToDefaults();
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    }
  };

  const renderGeneralSettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">General Preferences</h3>
        <div className="space-y-4">
          <label className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 cursor-pointer transition-colors">
            <div className="flex items-center space-x-3">
              <Bell className="h-5 w-5 text-blue-400" />
              <div>
                <div className="font-medium text-white">Enable Notifications</div>
                <div className="text-sm text-white/60">Receive all types of notifications</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.general?.enableNotifications || false}
              onChange={(e) => handleSettingChange('general', 'enableNotifications', e.target.checked)}
              className="rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500/50"
            />
          </label>
          
          <label className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 cursor-pointer transition-colors">
            <div className="flex items-center space-x-3">
              <Volume2 className="h-5 w-5 text-green-400" />
              <div>
                <div className="font-medium text-white">Enable Sounds</div>
                <div className="text-sm text-white/60">Play notification sounds</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.general?.enableSounds || false}
              onChange={(e) => handleSettingChange('general', 'enableSounds', e.target.checked)}
              className="rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500/50"
            />
          </label>
          
          <label className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 cursor-pointer transition-colors">
            <div className="flex items-center space-x-3">
              <Smartphone className="h-5 w-5 text-purple-400" />
              <div>
                <div className="font-medium text-white">Desktop Notifications</div>
                <div className="text-sm text-white/60">Show browser notifications</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.general?.enableDesktopNotifications || false}
              onChange={(e) => handleSettingChange('general', 'enableDesktopNotifications', e.target.checked)}
              className="rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500/50"
            />
          </label>
          
          <label className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 cursor-pointer transition-colors">
            <div className="flex items-center space-x-3">
              <Mail className="h-5 w-5 text-orange-400" />
              <div>
                <div className="font-medium text-white">Email Notifications</div>
                <div className="text-sm text-white/60">Send notifications via email</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.general?.enableEmailNotifications || false}
              onChange={(e) => handleSettingChange('general', 'enableEmailNotifications', e.target.checked)}
              className="rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500/50"
            />
          </label>
        </div>
      </div>
      
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Quiet Hours</h3>
        <div className="space-y-4">
          <label className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 cursor-pointer transition-colors">
            <div className="flex items-center space-x-3">
              <Clock className="h-5 w-5 text-indigo-400" />
              <div>
                <div className="font-medium text-white">Enable Quiet Hours</div>
                <div className="text-sm text-white/60">Disable notifications during specified hours</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.general?.quietHoursEnabled || false}
              onChange={(e) => handleSettingChange('general', 'quietHoursEnabled', e.target.checked)}
              className="rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500/50"
            />
          </label>
          
          {settings.general?.quietHoursEnabled && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Start Time</label>
                <input
                  type="time"
                  value={settings.general?.quietHoursStart || '22:00'}
                  onChange={(e) => handleSettingChange('general', 'quietHoursStart', e.target.value)}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">End Time</label>
                <input
                  type="time"
                  value={settings.general?.quietHoursEnd || '08:00'}
                  onChange={(e) => handleSettingChange('general', 'quietHoursEnd', e.target.value)}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderTaskSettings = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white mb-4">Task Notifications</h3>
      
      {[
        { key: 'taskAssigned', label: 'Task Assigned', desc: 'When a task is assigned to you' },
        { key: 'taskCompleted', label: 'Task Completed', desc: 'When a task is marked as completed' },
        { key: 'taskOverdue', label: 'Task Overdue', desc: 'When a task becomes overdue' },
        { key: 'taskCommented', label: 'Task Comments', desc: 'When someone comments on your tasks' },
        { key: 'taskStatusChanged', label: 'Status Changes', desc: 'When task status is updated' }
      ].map((setting) => (
        <label key={setting.key} className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 cursor-pointer transition-colors">
          <div>
            <div className="font-medium text-white">{setting.label}</div>
            <div className="text-sm text-white/60">{setting.desc}</div>
          </div>
          <input
            type="checkbox"
            checked={settings.taskNotifications?.[setting.key] || false}
            onChange={(e) => handleSettingChange('taskNotifications', setting.key, e.target.checked)}
            className="rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500/50"
          />
        </label>
      ))}
    </div>
  );

  const renderCalendarSettings = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white mb-4">Calendar Notifications</h3>
      
      {[
        { key: 'eventReminders', label: 'Event Reminders', desc: 'Reminders for upcoming events' },
        { key: 'eventUpdated', label: 'Event Updates', desc: 'When events are modified or rescheduled' },
        { key: 'eventCancelled', label: 'Event Cancellations', desc: 'When events are cancelled' },
        { key: 'dailyAgenda', label: 'Daily Agenda', desc: 'Daily summary of scheduled events' },
        { key: 'weeklyAgenda', label: 'Weekly Agenda', desc: 'Weekly overview of upcoming events' }
      ].map((setting) => (
        <label key={setting.key} className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 cursor-pointer transition-colors">
          <div>
            <div className="font-medium text-white">{setting.label}</div>
            <div className="text-sm text-white/60">{setting.desc}</div>
          </div>
          <input
            type="checkbox"
            checked={settings.calendarNotifications?.[setting.key] || false}
            onChange={(e) => handleSettingChange('calendarNotifications', setting.key, e.target.checked)}
            className="rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500/50"
          />
        </label>
      ))}
    </div>
  );

  const renderTeamSettings = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white mb-4">Team Notifications</h3>
      
      {[
        { key: 'newMessages', label: 'New Messages', desc: 'Team chat messages and updates' },
        { key: 'mentions', label: 'Mentions', desc: 'When you are mentioned in conversations' },
        { key: 'teamMemberJoined', label: 'Member Joined', desc: 'When new members join the team' },
        { key: 'teamMemberLeft', label: 'Member Left', desc: 'When team members leave' },
        { key: 'projectUpdates', label: 'Project Updates', desc: 'Important project announcements' }
      ].map((setting) => (
        <label key={setting.key} className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 cursor-pointer transition-colors">
          <div>
            <div className="font-medium text-white">{setting.label}</div>
            <div className="text-sm text-white/60">{setting.desc}</div>
          </div>
          <input
            type="checkbox"
            checked={settings.teamNotifications?.[setting.key] || false}
            onChange={(e) => handleSettingChange('teamNotifications', setting.key, e.target.checked)}
            className="rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500/50"
          />
        </label>
      ))}
    </div>
  );

  const renderReminderSettings = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-white mb-4">Reminder Settings</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">Default Reminder Time (minutes)</label>
          <select
            value={settings.reminderSettings?.defaultReminderTime || 15}
            onChange={(e) => handleSettingChange('reminderSettings', 'defaultReminderTime', parseInt(e.target.value))}
            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            <option value={5} className="bg-gray-800">5 minutes</option>
            <option value={10} className="bg-gray-800">10 minutes</option>
            <option value={15} className="bg-gray-800">15 minutes</option>
            <option value={30} className="bg-gray-800">30 minutes</option>
            <option value={60} className="bg-gray-800">1 hour</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">Task Deadline Reminder (hours)</label>
          <select
            value={settings.reminderSettings?.taskDeadlineReminder || 24}
            onChange={(e) => handleSettingChange('reminderSettings', 'taskDeadlineReminder', parseInt(e.target.value))}
            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            <option value={1} className="bg-gray-800">1 hour</option>
            <option value={2} className="bg-gray-800">2 hours</option>
            <option value={6} className="bg-gray-800">6 hours</option>
            <option value={12} className="bg-gray-800">12 hours</option>
            <option value={24} className="bg-gray-800">1 day</option>
            <option value={48} className="bg-gray-800">2 days</option>
          </select>
        </div>
      </div>
      
      <label className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 cursor-pointer transition-colors">
        <div>
          <div className="font-medium text-white">Smart Reminders</div>
          <div className="text-sm text-white/60">Automatically adjust reminder timing based on your schedule</div>
        </div>
        <input
          type="checkbox"
          checked={settings.reminderSettings?.enableSmartReminders || false}
          onChange={(e) => handleSettingChange('reminderSettings', 'enableSmartReminders', e.target.checked)}
          className="rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500/50"
        />
      </label>
    </div>
  );

  const renderActiveSection = () => {
    switch (activeSection) {
      case 'general':
        return renderGeneralSettings();
      case 'taskNotifications':
        return renderTaskSettings();
      case 'calendarNotifications':
        return renderCalendarSettings();
      case 'teamNotifications':
        return renderTeamSettings();
      case 'reminderSettings':
        return renderReminderSettings();
      default:
        return renderGeneralSettings();
    }
  };

  if (loading) {
    return (
      <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-lg p-6 animate-pulse">
        <div className="h-6 bg-white/20 rounded mb-4 w-1/3"></div>
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-white/10 rounded"></div>
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
            <Settings className="h-5 w-5" />
            <span>Notification Settings</span>
          </h2>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={handleTestNotification}
              className="flex items-center space-x-2 px-3 py-2 bg-green-500/20 text-green-400 border border-green-400/30 rounded-lg hover:bg-green-500/30 transition-colors"
            >
              <TestTube className="h-4 w-4" />
              <span>Test</span>
            </button>
            
            <button
              onClick={handleReset}
              className="flex items-center space-x-2 px-3 py-2 bg-orange-500/20 text-orange-400 border border-orange-400/30 rounded-lg hover:bg-orange-500/30 transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Reset</span>
            </button>
          </div>
        </div>
        
        {/* Success Message */}
        {showSuccess && (
          <div className="mb-4 p-3 bg-green-500/20 border border-green-400/30 rounded-lg flex items-center space-x-2">
            <Save className="h-4 w-4 text-green-400" />
            <span className="text-green-400 text-sm">Settings saved successfully!</span>
          </div>
        )}
        
        {/* Section Navigation */}
        <div className="flex space-x-1 bg-white/5 rounded-lg p-1">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeSection === section.id
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'text-white/60 hover:text-white/80 hover:bg-white/5'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{section.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Settings Content */}
      <div className="p-6">
        {renderActiveSection()}
      </div>
      
      {/* Save Indicator */}
      {saving && (
        <div className="px-6 pb-4">
          <div className="flex items-center space-x-2 text-blue-400 text-sm">
            <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin"></div>
            <span>Saving settings...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationSettings;