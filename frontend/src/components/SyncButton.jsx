import React, { useState } from 'react';
import { RefreshCw, CheckCircle, AlertCircle, Unlink, Loader, Calendar, Clock } from 'lucide-react';

const SyncButton = ({ syncStatus, loading, onConnect, onDisconnect, onSyncNow, lastSyncTime, syncData }) => {
  const [showConfirmDisconnect, setShowConfirmDisconnect] = useState(false);
  
  const getSyncStatusDisplay = () => {
    switch (syncStatus) {
      case 'connected':
        return {
          color: 'text-green-400',
          bgColor: 'bg-green-500/20 border-green-400/30',
          icon: CheckCircle,
          text: 'Connected to Google Calendar'
        };
      case 'connecting':
        return {
          color: 'text-blue-400',
          bgColor: 'bg-blue-500/20 border-blue-400/30',
          icon: Loader,
          text: 'Connecting to Google Calendar...'
        };
      case 'error':
        return {
          color: 'text-red-400',
          bgColor: 'bg-red-500/20 border-red-400/30',
          icon: AlertCircle,
          text: 'Connection Error'
        };
      default:
        return {
          color: 'text-gray-400',
          bgColor: 'bg-gray-500/20 border-gray-400/30',
          icon: Calendar,
          text: 'Not Connected'
        };
    }
  };

  const formatLastSyncTime = () => {
    if (!lastSyncTime) return 'Never synced';
    
    const syncDate = new Date(lastSyncTime);
    const now = new Date();
    const diffInMinutes = Math.floor((now - syncDate) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} hours ago`;
    return syncDate.toLocaleDateString();
  };

  const statusDisplay = getSyncStatusDisplay();
  const StatusIcon = statusDisplay.icon;

  const handleDisconnect = () => {
    if (showConfirmDisconnect) {
      onDisconnect();
      setShowConfirmDisconnect(false);
    } else {
      setShowConfirmDisconnect(true);
      setTimeout(() => setShowConfirmDisconnect(false), 5000);
    }
  };

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg">
      <div className="space-y-6">
        {/* Status Display */}
        <div className={`p-4 rounded-lg border ${statusDisplay.bgColor}`}>
          <div className="flex items-center space-x-3">
            <StatusIcon className={`h-6 w-6 ${statusDisplay.color} ${syncStatus === 'connecting' ? 'animate-spin' : ''}`} />
            <div className="flex-1">
              <h3 className="font-semibold text-white">{statusDisplay.text}</h3>
              {syncStatus === 'connected' && (
                <div className="flex items-center space-x-4 mt-2 text-sm text-white/60">
                  <div className="flex items-center space-x-1">
                    <Clock className="h-4 w-4" />
                    <span>Last sync: {formatLastSyncTime()}</span>
                  </div>
                  {syncData && (
                    <div className="flex items-center space-x-3">
                      <span>{syncData.calendarCount} calendars</span>
                      <span>•</span>
                      <span>{syncData.eventCount} events</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          {syncStatus === 'disconnected' && (
            <button
              onClick={onConnect}
              disabled={loading}
              className="w-full flex items-center justify-center space-x-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-blue-500/50 disabled:to-blue-600/50 text-white font-medium py-3 px-4 rounded-lg transition-all duration-200 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader className="h-5 w-5 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <Calendar className="h-5 w-5" />
                  <span>Connect Google Calendar</span>
                </>
              )}
            </button>
          )}

          {syncStatus === 'connected' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                onClick={onSyncNow}
                disabled={loading}
                className="flex items-center justify-center space-x-2 bg-white/10 hover:bg-white/20 disabled:bg-white/5 text-white font-medium py-2 px-4 rounded-lg border border-white/20 hover:border-white/30 transition-all duration-200 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader className="h-4 w-4 animate-spin" />
                    <span>Syncing...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    <span>Sync Now</span>
                  </>
                )}
              </button>
              
              <button
                onClick={handleDisconnect}
                disabled={loading}
                className={`flex items-center justify-center space-x-2 font-medium py-2 px-4 rounded-lg border transition-all duration-200 disabled:cursor-not-allowed ${
                  showConfirmDisconnect
                    ? 'bg-red-500 hover:bg-red-600 text-white border-red-500'
                    : 'bg-white/10 hover:bg-white/20 disabled:bg-white/5 text-white/80 border-white/20 hover:border-white/30'
                }`}
              >
                <Unlink className="h-4 w-4" />
                <span>{showConfirmDisconnect ? 'Confirm Disconnect' : 'Disconnect'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Connection Instructions */}
        {syncStatus === 'disconnected' && (
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <h4 className="text-sm font-semibold text-white mb-2">How it works:</h4>
            <ul className="text-sm text-white/70 space-y-1">
              <li>• Click "Connect Google Calendar" to authorize access</li>
              <li>• Choose which calendars to sync</li>
              <li>• Import events and manage them seamlessly</li>
              <li>• Automatic synchronization every 15 minutes</li>
            </ul>
          </div>
        )}

        {/* Sync Statistics */}
        {syncStatus === 'connected' && syncData && (
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <h4 className="text-sm font-semibold text-white mb-3">Sync Statistics</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">{syncData.calendarCount}</div>
                <div className="text-xs text-white/60">Connected Calendars</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">{syncData.eventCount}</div>
                <div className="text-xs text-white/60">Synced Events</div>
              </div>
            </div>
          </div>
        )}

        {/* Privacy Note */}
        <div className="text-xs text-white/50 p-3 bg-white/5 rounded border border-white/10">
          <div className="flex items-start space-x-2">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium mb-1">Privacy & Security</p>
              <p>We only access your calendar data to provide synchronization features. Your data is encrypted and never shared with third parties.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SyncButton;