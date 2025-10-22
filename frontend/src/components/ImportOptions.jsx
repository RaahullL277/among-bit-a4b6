import React, { useState } from 'react';
import { Download, Upload, Calendar, Clock, Filter, CheckCircle, AlertCircle, Settings, ChevronDown, ChevronUp } from 'lucide-react';

const ImportOptions = ({ calendars, selectedCalendars, onToggleCalendar, onImport, loading, error }) => {
  const [importSettings, setImportSettings] = useState({
    dateRange: 'month',
    includeRecurring: true,
    includeAllDay: true,
    includeCancelled: false,
    mergeConflicts: 'skip',
    notifyOnImport: true
  });
  
  const [customDateRange, setCustomDateRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  });
  
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [importHistory, setImportHistory] = useState([
    {
      id: 1,
      date: '2024-01-15T10:30:00Z',
      calendars: ['Primary Calendar', 'Work Schedule'],
      eventsImported: 23,
      status: 'success'
    },
    {
      id: 2,
      date: '2024-01-10T14:20:00Z',
      calendars: ['Personal Events'],
      eventsImported: 12,
      status: 'success'
    },
    {
      id: 3,
      date: '2024-01-08T09:15:00Z',
      calendars: ['Work Schedule'],
      eventsImported: 0,
      status: 'error'
    }
  ]);

  const dateRangeOptions = [
    { value: 'week', label: 'Next 7 days', days: 7 },
    { value: 'month', label: 'Next 30 days', days: 30 },
    { value: '3months', label: 'Next 3 months', days: 90 },
    { value: 'year', label: 'Next year', days: 365 },
    { value: 'custom', label: 'Custom range', days: null }
  ];

  const conflictResolutionOptions = [
    { value: 'skip', label: 'Skip conflicting events', description: 'Leave existing events unchanged' },
    { value: 'overwrite', label: 'Overwrite existing events', description: 'Replace local events with Google Calendar data' },
    { value: 'duplicate', label: 'Create duplicates', description: 'Import all events even if duplicates exist' }
  ];

  const handleSettingChange = (key, value) => {
    setImportSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleImport = () => {
    const importData = {
      calendars: selectedCalendars,
      settings: importSettings,
      dateRange: importSettings.dateRange === 'custom' ? customDateRange : null
    };
    
    onImport(importData);
    
    // Add to import history (mock)
    const newHistoryItem = {
      id: Date.now(),
      date: new Date().toISOString(),
      calendars: calendars.filter(cal => selectedCalendars.includes(cal.id)).map(cal => cal.name),
      eventsImported: Math.floor(Math.random() * 50) + 1,
      status: 'success'
    };
    
    setImportHistory(prev => [newHistoryItem, ...prev.slice(0, 4)]);
  };

  const getSelectedCalendarCount = () => selectedCalendars.length;
  const getTotalEventCount = () => {
    return calendars
      .filter(cal => selectedCalendars.includes(cal.id))
      .reduce((sum, cal) => sum + cal.eventCount, 0);
  };

  const getDateRangeDescription = () => {
    const option = dateRangeOptions.find(opt => opt.value === importSettings.dateRange);
    if (importSettings.dateRange === 'custom') {
      return `From ${new Date(customDateRange.start).toLocaleDateString()} to ${new Date(customDateRange.end).toLocaleDateString()}`;
    }
    return option?.label || '';
  };

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-lg">
      <div className="p-6 border-b border-white/20">
        <h2 className="text-xl font-semibold text-white flex items-center space-x-2">
          <Download className="h-5 w-5" />
          <span>Import Options</span>
        </h2>
        <p className="text-white/60 mt-2">
          Configure how you want to import your Google Calendar events.
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Calendar Selection Summary */}
        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
          <h3 className="text-lg font-medium text-white mb-3 flex items-center space-x-2">
            <Calendar className="h-5 w-5" />
            <span>Selected Calendars</span>
          </h3>
          
          {getSelectedCalendarCount() === 0 ? (
            <div className="text-center py-4">
              <AlertCircle className="h-8 w-8 text-orange-400 mx-auto mb-2" />
              <p className="text-white/60">No calendars selected for import</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {calendars
                .filter(cal => selectedCalendars.includes(cal.id))
                .map(calendar => (
                  <div key={calendar.id} className="flex items-center space-x-3 p-2 bg-white/10 rounded border border-white/20">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: calendar.color }}></div>
                    <div className="flex-1">
                      <div className="font-medium text-white text-sm">{calendar.name}</div>
                      <div className="text-xs text-white/60">{calendar.eventCount} events</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          
          {getSelectedCalendarCount() > 0 && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-blue-400">{getSelectedCalendarCount()}</div>
                  <div className="text-xs text-white/60">Calendars</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-400">{getTotalEventCount()}</div>
                  <div className="text-xs text-white/60">Total Events</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-purple-400">
                    {dateRangeOptions.find(opt => opt.value === importSettings.dateRange)?.days || '∞'}
                  </div>
                  <div className="text-xs text-white/60">Days Range</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Import Settings */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-white flex items-center space-x-2">
            <Settings className="h-5 w-5" />
            <span>Import Settings</span>
          </h3>
          
          {/* Date Range */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Date Range
            </label>
            <select
              value={importSettings.dateRange}
              onChange={(e) => handleSettingChange('dateRange', e.target.value)}
              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              {dateRangeOptions.map(option => (
                <option key={option.value} value={option.value} className="bg-gray-800">
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-white/60 mt-1">{getDateRangeDescription()}</p>
            
            {/* Custom Date Range */}
            {importSettings.dateRange === 'custom' && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={customDateRange.start}
                    onChange={(e) => setCustomDateRange(prev => ({ ...prev, start: e.target.value }))}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1">End Date</label>
                  <input
                    type="date"
                    value={customDateRange.end}
                    onChange={(e) => setCustomDateRange(prev => ({ ...prev, end: e.target.value }))}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>
            )}
          </div>
          
          {/* Quick Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center space-x-3 p-3 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 cursor-pointer">
              <input
                type="checkbox"
                checked={importSettings.includeRecurring}
                onChange={(e) => handleSettingChange('includeRecurring', e.target.checked)}
                className="rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500/50"
              />
              <div>
                <div className="text-sm font-medium text-white">Include Recurring Events</div>
                <div className="text-xs text-white/60">Import repeating events and their instances</div>
              </div>
            </label>
            
            <label className="flex items-center space-x-3 p-3 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 cursor-pointer">
              <input
                type="checkbox"
                checked={importSettings.includeAllDay}
                onChange={(e) => handleSettingChange('includeAllDay', e.target.checked)}
                className="rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500/50"
              />
              <div>
                <div className="text-sm font-medium text-white">Include All-Day Events</div>
                <div className="text-xs text-white/60">Import events that span entire days</div>
              </div>
            </label>
            
            <label className="flex items-center space-x-3 p-3 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 cursor-pointer">
              <input
                type="checkbox"
                checked={importSettings.includeCancelled}
                onChange={(e) => handleSettingChange('includeCancelled', e.target.checked)}
                className="rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500/50"
              />
              <div>
                <div className="text-sm font-medium text-white">Include Cancelled Events</div>
                <div className="text-xs text-white/60">Import events marked as cancelled</div>
              </div>
            </label>
            
            <label className="flex items-center space-x-3 p-3 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 cursor-pointer">
              <input
                type="checkbox"
                checked={importSettings.notifyOnImport}
                onChange={(e) => handleSettingChange('notifyOnImport', e.target.checked)}
                className="rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500/50"
              />
              <div>
                <div className="text-sm font-medium text-white">Notify on Import</div>
                <div className="text-xs text-white/60">Send notification when import completes</div>
              </div>
            </label>
          </div>
        </div>

        {/* Advanced Settings */}
        <div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center space-x-2 text-white/80 hover:text-white transition-colors"
          >
            {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <span className="font-medium">Advanced Settings</span>
          </button>
          
          {showAdvanced && (
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-3">Conflict Resolution</label>
                <div className="space-y-2">
                  {conflictResolutionOptions.map(option => (
                    <label key={option.value} className="flex items-start space-x-3 p-3 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 cursor-pointer">
                      <input
                        type="radio"
                        name="mergeConflicts"
                        value={option.value}
                        checked={importSettings.mergeConflicts === option.value}
                        onChange={(e) => handleSettingChange('mergeConflicts', e.target.value)}
                        className="mt-1 text-blue-500 focus:ring-blue-500/50"
                      />
                      <div>
                        <div className="text-sm font-medium text-white">{option.label}</div>
                        <div className="text-xs text-white/60">{option.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Import Button */}
        <div className="pt-4 border-t border-white/20">
          <button
            onClick={handleImport}
            disabled={loading || getSelectedCalendarCount() === 0}
            className="w-full flex items-center justify-center space-x-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-gray-500/50 disabled:to-gray-600/50 text-white font-medium py-3 px-6 rounded-lg transition-all duration-200 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Importing Events...</span>
              </>
            ) : (
              <>
                <Upload className="h-5 w-5" />
                <span>Import Selected Events</span>
              </>
            )}
          </button>
          
          {error && (
            <div className="mt-3 p-3 bg-red-500/20 border border-red-400/30 rounded-lg flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 text-red-400" />
              <span className="text-red-400 text-sm">{error}</span>
            </div>
          )}
        </div>

        {/* Import History */}
        {importHistory.length > 0 && (
          <div className="pt-6 border-t border-white/20">
            <h3 className="text-lg font-medium text-white mb-4 flex items-center space-x-2">
              <Clock className="h-5 w-5" />
              <span>Recent Imports</span>
            </h3>
            
            <div className="space-y-2">
              {importHistory.map(item => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10">
                  <div className="flex items-center space-x-3">
                    {item.status === 'success' ? (
                      <CheckCircle className="h-4 w-4 text-green-400" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-400" />
                    )}
                    <div>
                      <div className="text-sm font-medium text-white">
                        {item.calendars.join(', ')}
                      </div>
                      <div className="text-xs text-white/60">
                        {new Date(item.date).toLocaleDateString()} • {item.eventsImported} events
                      </div>
                    </div>
                  </div>
                  <div className={`text-xs px-2 py-1 rounded-full ${
                    item.status === 'success' 
                      ? 'bg-green-500/20 text-green-400' 
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {item.status === 'success' ? 'Success' : 'Failed'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportOptions;