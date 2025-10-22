import React, { useState } from 'react';
import { Calendar, RefreshCw, Settings, AlertCircle, CheckCircle, Clock, Sync } from 'lucide-react';
import { Link } from 'react-router-dom';
import useGoogleSync from '../hooks/useGoogleSync';
import useGoogleCalendar from '../hooks/useGoogleCalendar';
import SyncButton from '../components/SyncButton';
import GoogleCalendarView from '../components/GoogleCalendarView';
import ImportOptions from '../components/ImportOptions';

const CalendarSync = () => {
  const {
    syncStatus,
    loading: syncLoading,
    error: syncError,
    syncData,
    lastSyncTime,
    isAuthorized,
    initiateSync,
    disconnectSync,
    syncNow
  } = useGoogleSync();

  const {
    calendars,
    events,
    selectedCalendars,
    loading: calendarLoading,
    error: calendarError,
    dateRange,
    toggleCalendarSelection,
    updateDateRange
  } = useGoogleCalendar();

  const [activeTab, setActiveTab] = useState('overview');
  const [notification, setNotification] = useState(null);
  const [importLoading, setImportLoading] = useState(false);

  const handleImport = async (importData) => {
    try {
      setImportLoading(true);
      
      // TODO: Connect to the backend API when ready.
      // const response = await fetch('http://localhost:8000/api/google-sync/import', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(importData)
      // });
      // const result = await response.json();

      // Using mock data for now
      setTimeout(() => {
        const eventsImported = Math.floor(Math.random() * 50) + 10;
        setNotification({
          type: 'success',
          message: `Successfully imported ${eventsImported} events from ${importData.calendars.length} calendar(s)`
        });
        setImportLoading(false);
        
        // Clear notification after 5 seconds
        setTimeout(() => setNotification(null), 5000);
      }, 3000);
      
    } catch (error) {
      setNotification({
        type: 'error',
        message: 'Failed to import events. Please try again.'
      });
      setImportLoading(false);
      setTimeout(() => setNotification(null), 5000);
    }
  };

  const getSyncStatusColor = () => {
    switch (syncStatus) {
      case 'connected':
        return 'text-green-400';
      case 'connecting':
        return 'text-blue-400';
      case 'error':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Calendar },
    { id: 'calendars', label: 'Calendar View', icon: Calendar },
    { id: 'import', label: 'Import Options', icon: RefreshCw },
    { id: 'settings', label: 'Sync Settings', icon: Settings }
  ];

  if (syncError || calendarError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="bg-red-500/10 backdrop-blur-md rounded-xl p-8 border border-red-400/20 text-center max-w-md">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <div className="text-red-400 text-lg font-semibold mb-2">Sync Error</div>
          <div className="text-red-300 text-sm mb-4">{syncError || calendarError}</div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-400/30 rounded-lg hover:bg-red-500/30 transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900">
      {/* Header */}
      <header className="bg-white/10 backdrop-blur-md border-b border-white/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg">
                  <Sync className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">Calendar Sync</h1>
                  <p className="text-sm text-white/60">Google Calendar Integration</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${
                syncStatus === 'connected' 
                  ? 'bg-green-500/20 text-green-400 border border-green-400/30'
                  : syncStatus === 'connecting'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-400/30'
                  : 'bg-gray-500/20 text-gray-400 border border-gray-400/30'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  syncStatus === 'connected' ? 'bg-green-400' :
                  syncStatus === 'connecting' ? 'bg-blue-400 animate-pulse' : 'bg-gray-400'
                }`}></div>
                <span className="capitalize">{syncStatus.replace('-', ' ')}</span>
              </div>
              
              {lastSyncTime && (
                <div className="flex items-center space-x-1 text-sm text-white/60">
                  <Clock className="h-4 w-4" />
                  <span>Last sync: {new Date(lastSyncTime).toLocaleTimeString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Notification */}
      {notification && (
        <div className="fixed top-20 right-4 z-50">
          <div className={`p-4 rounded-lg border backdrop-blur-md shadow-lg flex items-center space-x-3 ${
            notification.type === 'success'
              ? 'bg-green-500/20 border-green-400/30 text-green-400'
              : 'bg-red-500/20 border-red-400/30 text-red-400'
          }`}>
            {notification.type === 'success' ? (
              <CheckCircle className="h-5 w-5" />
            ) : (
              <AlertCircle className="h-5 w-5" />
            )}
            <span className="font-medium">{notification.message}</span>
            <button
              onClick={() => setNotification(null)}
              className="ml-2 hover:opacity-70 transition-opacity"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tab Navigation */}
        <div className="flex space-x-1 mb-8 bg-white/5 rounded-lg p-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'text-white/60 hover:text-white/80 hover:bg-white/5'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="space-y-8">
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {/* Sync Status and Controls */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1">
                  <SyncButton
                    syncStatus={syncStatus}
                    loading={syncLoading}
                    onConnect={initiateSync}
                    onDisconnect={disconnectSync}
                    onSyncNow={syncNow}
                    lastSyncTime={lastSyncTime}
                    syncData={syncData}
                  />
                </div>
                
                {/* Overview Stats */}
                <div className="lg:col-span-2">
                  <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg">
                    <h2 className="text-xl font-semibold text-white mb-6">Sync Overview</h2>
                    
                    {syncStatus === 'connected' ? (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div className="text-center">
                          <div className="text-3xl font-bold text-blue-400">{calendars.length}</div>
                          <div className="text-sm text-white/60">Available Calendars</div>
                        </div>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-green-400">{selectedCalendars.length}</div>
                          <div className="text-sm text-white/60">Selected Calendars</div>
                        </div>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-purple-400">{events.length}</div>
                          <div className="text-sm text-white/60">Visible Events</div>
                        </div>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-orange-400">
                            {calendars.reduce((sum, cal) => sum + cal.eventCount, 0)}
                          </div>
                          <div className="text-sm text-white/60">Total Events</div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <Calendar className="h-12 w-12 text-white/40 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-white mb-2">Connect Your Google Calendar</h3>
                        <p className="text-white/60 mb-6">Get started by connecting your Google Calendar account to sync your events.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Quick Calendar Preview */}
              {syncStatus === 'connected' && events.length > 0 && (
                <div>
                  <h2 className="text-2xl font-bold text-white mb-6">Upcoming Events</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {events.slice(0, 6).map((event) => (
                      <div
                        key={event.id}
                        className="bg-white/5 rounded-lg p-4 border-l-4 hover:bg-white/10 transition-colors"
                        style={{ borderLeftColor: event.color }}
                      >
                        <h4 className="font-semibold text-white mb-1 truncate">{event.title}</h4>
                        <div className="text-sm text-white/60 mb-2">{event.calendarName}</div>
                        <div className="flex items-center space-x-2 text-xs text-white/60">
                          <Clock className="h-3 w-3" />
                          <span>
                            {new Date(event.start).toLocaleDateString()} at{' '}
                            {new Date(event.start).toLocaleTimeString('en-US', { 
                              hour: 'numeric', 
                              minute: '2-digit', 
                              hour12: true 
                            })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'calendars' && (
            <GoogleCalendarView
              calendars={calendars}
              events={events}
              selectedCalendars={selectedCalendars}
              onToggleCalendar={toggleCalendarSelection}
              loading={calendarLoading}
              dateRange={dateRange}
              onDateRangeChange={updateDateRange}
            />
          )}

          {activeTab === 'import' && (
            <ImportOptions
              calendars={calendars}
              selectedCalendars={selectedCalendars}
              onToggleCalendar={toggleCalendarSelection}
              onImport={handleImport}
              loading={importLoading}
              error={null}
            />
          )}

          {activeTab === 'settings' && (
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg">
              <h2 className="text-xl font-semibold text-white mb-6">Sync Settings</h2>
              
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-white">Automatic Sync</h3>
                    <div className="space-y-3">
                      <label className="flex items-center space-x-3">
                        <input type="checkbox" defaultChecked className="rounded border-white/20 bg-white/10 text-blue-500" />
                        <span className="text-white/80">Enable automatic synchronization</span>
                      </label>
                      <label className="flex items-center space-x-3">
                        <input type="checkbox" defaultChecked className="rounded border-white/20 bg-white/10 text-blue-500" />
                        <span className="text-white/80">Sync every 15 minutes</span>
                      </label>
                      <label className="flex items-center space-x-3">
                        <input type="checkbox" className="rounded border-white/20 bg-white/10 text-blue-500" />
                        <span className="text-white/80">Sync only when app is active</span>
                      </label>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-white">Notifications</h3>
                    <div className="space-y-3">
                      <label className="flex items-center space-x-3">
                        <input type="checkbox" defaultChecked className="rounded border-white/20 bg-white/10 text-blue-500" />
                        <span className="text-white/80">Notify on successful sync</span>
                      </label>
                      <label className="flex items-center space-x-3">
                        <input type="checkbox" defaultChecked className="rounded border-white/20 bg-white/10 text-blue-500" />
                        <span className="text-white/80">Notify on sync errors</span>
                      </label>
                      <label className="flex items-center space-x-3">
                        <input type="checkbox" className="rounded border-white/20 bg-white/10 text-blue-500" />
                        <span className="text-white/80">Email sync reports</span>
                      </label>
                    </div>
                  </div>
                </div>
                
                <div className="pt-6 border-t border-white/20">
                  <h3 className="text-lg font-medium text-white mb-4">Data Management</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button className="flex items-center justify-center space-x-2 p-3 bg-blue-500/20 text-blue-400 border border-blue-400/30 rounded-lg hover:bg-blue-500/30 transition-colors">
                      <RefreshCw className="h-4 w-4" />
                      <span>Force Full Sync</span>
                    </button>
                    <button className="flex items-center justify-center space-x-2 p-3 bg-orange-500/20 text-orange-400 border border-orange-400/30 rounded-lg hover:bg-orange-500/30 transition-colors">
                      <Settings className="h-4 w-4" />
                      <span>Reset Sync Data</span>
                    </button>
                    <button className="flex items-center justify-center space-x-2 p-3 bg-red-500/20 text-red-400 border border-red-400/30 rounded-lg hover:bg-red-500/30 transition-colors">
                      <AlertCircle className="h-4 w-4" />
                      <span>Clear All Data</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default CalendarSync;