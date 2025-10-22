import React, { useState } from 'react';
import { Clock, Calendar, Coffee, Moon, Sunrise, Sunset, Bell } from 'lucide-react';

const SnoozeControl = ({ onSnooze, onCancel, notificationTitle }) => {
  const [customDateTime, setCustomDateTime] = useState('');
  const [selectedOption, setSelectedOption] = useState(null);

  const snoozeOptions = [
    {
      id: '15min',
      label: '15 minutes',
      icon: Clock,
      duration: 15 * 60 * 1000,
      description: 'Short break'
    },
    {
      id: '1hour',
      label: '1 hour',
      icon: Coffee,
      duration: 60 * 60 * 1000,
      description: 'Focus time'
    },
    {
      id: '3hours',
      label: '3 hours',
      icon: Sunrise,
      duration: 3 * 60 * 60 * 1000,
      description: 'Half day'
    },
    {
      id: 'tomorrow',
      label: 'Tomorrow 9 AM',
      icon: Calendar,
      duration: null,
      description: 'Next business day',
      getTime: () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        return tomorrow;
      }
    },
    {
      id: 'nextweek',
      label: 'Next Monday',
      icon: Calendar,
      duration: null,
      description: 'Start of next week',
      getTime: () => {
        const nextMonday = new Date();
        const daysUntilMonday = ((1 + 7 - nextMonday.getDay()) % 7) || 7;
        nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
        nextMonday.setHours(9, 0, 0, 0);
        return nextMonday;
      }
    },
    {
      id: 'evening',
      label: 'This evening',
      icon: Sunset,
      duration: null,
      description: '6 PM today',
      getTime: () => {
        const evening = new Date();
        if (evening.getHours() >= 18) {
          evening.setDate(evening.getDate() + 1);
        }
        evening.setHours(18, 0, 0, 0);
        return evening;
      }
    }
  ];

  const handleSnoozeOption = (option) => {
    setSelectedOption(option.id);
    
    let snoozeUntil;
    if (option.duration) {
      snoozeUntil = new Date(Date.now() + option.duration);
    } else if (option.getTime) {
      snoozeUntil = option.getTime();
    }
    
    setTimeout(() => {
      onSnooze(snoozeUntil);
    }, 300);
  };

  const handleCustomSnooze = () => {
    if (customDateTime) {
      const snoozeUntil = new Date(customDateTime);
      if (snoozeUntil > new Date()) {
        onSnooze(snoozeUntil);
      }
    }
  };

  const formatDateTime = (date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const getMinDateTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 1);
    return now.toISOString().slice(0, 16);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="p-6 border-b border-white/20">
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Clock className="h-5 w-5 text-blue-400" />
            </div>
            <h3 className="text-xl font-semibold text-white">Snooze Notification</h3>
          </div>
          {notificationTitle && (
            <p className="text-sm text-white/60 truncate">
              "{notificationTitle}"
            </p>
          )}
        </div>

        {/* Snooze Options */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 gap-3">
            {snoozeOptions.map((option) => {
              const Icon = option.icon;
              const isSelected = selectedOption === option.id;
              const futureTime = option.getTime ? option.getTime() : new Date(Date.now() + (option.duration || 0));
              
              return (
                <button
                  key={option.id}
                  onClick={() => handleSnoozeOption(option)}
                  disabled={isSelected}
                  className={`flex items-center space-x-4 p-4 rounded-lg border transition-all text-left ${
                    isSelected
                      ? 'bg-blue-500/30 border-blue-400/50 scale-95'
                      : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${
                    isSelected ? 'bg-blue-500/30' : 'bg-white/10'
                  }`}>
                    <Icon className={`h-4 w-4 ${
                      isSelected ? 'text-blue-300' : 'text-white/70'
                    }`} />
                  </div>
                  
                  <div className="flex-1">
                    <div className={`font-medium ${
                      isSelected ? 'text-blue-200' : 'text-white'
                    }`}>
                      {option.label}
                    </div>
                    <div className="text-xs text-white/60 mt-1">
                      {option.description} • Until {formatDateTime(futureTime)}
                    </div>
                  </div>
                  
                  {isSelected && (
                    <div className="flex items-center space-x-2 text-blue-300">
                      <div className="w-4 h-4 border-2 border-blue-300/30 border-t-blue-300 rounded-full animate-spin"></div>
                      <span className="text-sm">Snoozing...</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Custom Date/Time */}
          <div className="border-t border-white/10 pt-4">
            <label className="block text-sm font-medium text-white/80 mb-2">
              Custom Date & Time
            </label>
            <div className="flex space-x-2">
              <input
                type="datetime-local"
                value={customDateTime}
                onChange={(e) => setCustomDateTime(e.target.value)}
                min={getMinDateTime()}
                className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent"
              />
              <button
                onClick={handleCustomSnooze}
                disabled={!customDateTime || new Date(customDateTime) <= new Date()}
                className="px-4 py-2 bg-blue-500/20 text-blue-400 border border-blue-400/30 rounded-lg hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Set
              </button>
            </div>
            {customDateTime && (
              <p className="text-xs text-white/60 mt-2">
                Snooze until {formatDateTime(new Date(customDateTime))}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6">
          <div className="flex space-x-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2 bg-white/10 text-white/80 border border-white/20 rounded-lg hover:bg-white/20 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onSnooze(null)}
              className="flex items-center justify-center space-x-2 px-4 py-2 bg-red-500/20 text-red-400 border border-red-400/30 rounded-lg hover:bg-red-500/30 transition-colors"
            >
              <Bell className="h-4 w-4" />
              <span>Dismiss</span>
            </button>
          </div>
        </div>

        {/* Helper Text */}
        <div className="px-6 pb-4">
          <div className="text-xs text-white/50 p-3 bg-white/5 rounded-lg border border-white/10">
            <p className="mb-1">💡 <strong>Pro tip:</strong> Snoozed notifications will reappear at the specified time.</p>
            <p>You can also dismiss notifications permanently if they're no longer relevant.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SnoozeControl;