import React, { useState } from 'react';
import { Bell, Check, Trash2, Clock, ExternalLink, Filter, Search, MoreVertical, CheckCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

const AlertList = ({ 
  notifications, 
  onMarkAsRead, 
  onMarkAllAsRead, 
  onDeleteNotification, 
  onSnoozeNotification,
  loading,
  filter,
  onFilterChange 
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showActions, setShowActions] = useState(null);
  const [selectedNotifications, setSelectedNotifications] = useState([]);

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'task_completed':
        return '✅';
      case 'task_assigned':
        return '📋';
      case 'task_overdue':
        return '⚠️';
      case 'calendar_event':
        return '📅';
      case 'calendar_updated':
        return '🔄';
      case 'team_message':
        return '💬';
      case 'team_member_joined':
        return '👋';
      case 'system_update':
        return '🔧';
      default:
        return '🔔';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high':
        return 'border-l-red-400';
      case 'medium':
        return 'border-l-yellow-400';
      case 'low':
        return 'border-l-green-400';
      default:
        return 'border-l-blue-400';
    }
  };

  const getTimeAgo = (timestamp) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInMinutes = Math.floor((now - time) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    if (diffInMinutes < 10080) return `${Math.floor(diffInMinutes / 1440)}d ago`;
    return time.toLocaleDateString();
  };

  const filterOptions = [
    { value: 'all', label: 'All Notifications', count: notifications.length },
    { value: 'unread', label: 'Unread', count: notifications.filter(n => !n.read).length },
    { value: 'task_assigned', label: 'Task Assignments', count: notifications.filter(n => n.type === 'task_assigned').length },
    { value: 'calendar_event', label: 'Calendar Events', count: notifications.filter(n => n.type === 'calendar_event').length },
    { value: 'team_message', label: 'Team Messages', count: notifications.filter(n => n.type === 'team_message').length }
  ];

  const filteredNotifications = notifications.filter(notification => {
    const matchesSearch = notification.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         notification.message.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const handleSelectNotification = (notificationId) => {
    setSelectedNotifications(prev => {
      if (prev.includes(notificationId)) {
        return prev.filter(id => id !== notificationId);
      } else {
        return [...prev, notificationId];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedNotifications.length === filteredNotifications.length) {
      setSelectedNotifications([]);
    } else {
      setSelectedNotifications(filteredNotifications.map(n => n.id));
    }
  };

  const handleBulkAction = (action) => {
    selectedNotifications.forEach(id => {
      if (action === 'markRead') {
        onMarkAsRead(id);
      } else if (action === 'delete') {
        onDeleteNotification(id);
      }
    });
    setSelectedNotifications([]);
  };

  if (loading) {
    return (
      <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-lg p-6 animate-pulse">
        <div className="h-6 bg-white/20 rounded mb-4 w-1/3"></div>
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-start space-x-3 p-4 bg-white/5 rounded-lg">
              <div className="w-10 h-10 bg-white/20 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-white/20 rounded mb-2 w-3/4"></div>
                <div className="h-3 bg-white/10 rounded w-1/2"></div>
              </div>
            </div>
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
            <Bell className="h-5 w-5" />
            <span>Notifications</span>
            <span className="text-sm text-white/60 bg-white/20 px-2 py-1 rounded-full">
              {notifications.filter(n => !n.read).length} unread
            </span>
          </h2>
          
          <button
            onClick={onMarkAllAsRead}
            disabled={notifications.filter(n => !n.read).length === 0}
            className="flex items-center space-x-2 px-3 py-2 bg-blue-500/20 text-blue-400 border border-blue-400/30 rounded-lg hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <CheckCheck className="h-4 w-4" />
            <span>Mark All Read</span>
          </button>
        </div>
        
        {/* Search and Filters */}
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notifications..."
              className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent"
            />
          </div>
          
          <div className="flex space-x-2 overflow-x-auto pb-1">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => onFilterChange(option.value)}
                className={`flex items-center space-x-2 px-3 py-1 rounded-full border text-sm font-medium whitespace-nowrap transition-all ${
                  filter === option.value
                    ? 'bg-blue-500/30 text-blue-300 border-blue-400/40'
                    : 'bg-white/10 text-white/60 border-white/20 hover:bg-white/20'
                }`}
              >
                <span>{option.label}</span>
                {option.count > 0 && (
                  <span className="bg-white/20 px-1.5 py-0.5 rounded text-xs">{option.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        
        {/* Bulk Actions */}
        {selectedNotifications.length > 0 && (
          <div className="flex items-center space-x-3 mt-4 p-3 bg-blue-500/20 border border-blue-400/30 rounded-lg">
            <span className="text-blue-300 text-sm">
              {selectedNotifications.length} notification{selectedNotifications.length > 1 ? 's' : ''} selected
            </span>
            <div className="flex space-x-2">
              <button
                onClick={() => handleBulkAction('markRead')}
                className="px-3 py-1 bg-blue-500/30 text-blue-300 rounded text-sm hover:bg-blue-500/40 transition-colors"
              >
                Mark Read
              </button>
              <button
                onClick={() => handleBulkAction('delete')}
                className="px-3 py-1 bg-red-500/30 text-red-300 rounded text-sm hover:bg-red-500/40 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Notifications List */}
      <div className="p-6">
        {filteredNotifications.length === 0 ? (
          <div className="text-center py-12">
            <Bell className="h-12 w-12 text-white/40 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">
              {searchQuery ? 'No matching notifications' : 'No notifications'}
            </h3>
            <p className="text-white/60">
              {searchQuery 
                ? 'Try adjusting your search terms'
                : 'You\'re all caught up! New notifications will appear here.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Select All */}
            {filteredNotifications.length > 0 && (
              <div className="flex items-center space-x-3 pb-2 border-b border-white/10">
                <input
                  type="checkbox"
                  checked={selectedNotifications.length === filteredNotifications.length}
                  onChange={handleSelectAll}
                  className="rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500/50"
                />
                <span className="text-sm text-white/70">Select all visible notifications</span>
              </div>
            )}
            
            {filteredNotifications.map((notification) => (
              <div
                key={notification.id}
                className={`group relative flex items-start space-x-4 p-4 rounded-lg border-l-4 transition-all hover:bg-white/5 ${
                  notification.read 
                    ? 'bg-white/5 opacity-75' 
                    : 'bg-white/10'
                } ${getPriorityColor(notification.priority)}`}
              >
                {/* Selection Checkbox */}
                <input
                  type="checkbox"
                  checked={selectedNotifications.includes(notification.id)}
                  onChange={() => handleSelectNotification(notification.id)}
                  className="mt-1 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500/50"
                />
                
                {/* Notification Icon/Avatar */}
                <div className="flex-shrink-0">
                  {notification.avatar && !notification.avatar.startsWith('http') && notification.avatar.length <= 3 ? (
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                      {notification.avatar}
                    </div>
                  ) : (
                    <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-lg">
                      {getNotificationIcon(notification.type)}
                    </div>
                  )}
                  
                  {!notification.read && (
                    <div className="absolute top-2 left-2 w-2 h-2 bg-blue-400 rounded-full"></div>
                  )}
                </div>
                
                {/* Notification Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className={`text-sm font-semibold mb-1 ${
                        notification.read ? 'text-white/70' : 'text-white'
                      }`}>
                        {notification.title}
                      </h3>
                      <p className={`text-sm leading-relaxed mb-2 ${
                        notification.read ? 'text-white/50' : 'text-white/80'
                      }`}>
                        {notification.message}
                      </p>
                      
                      <div className="flex items-center space-x-3 text-xs text-white/60">
                        <div className="flex items-center space-x-1">
                          <Clock className="h-3 w-3" />
                          <span>{getTimeAgo(notification.timestamp)}</span>
                        </div>
                        
                        {notification.priority !== 'low' && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            notification.priority === 'high' 
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {notification.priority.toUpperCase()}
                          </span>
                        )}
                        
                        {notification.actionUrl && (
                          <Link
                            to={notification.actionUrl}
                            className="flex items-center space-x-1 text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span>View</span>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Actions */}
                <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="relative">
                    <button
                      onClick={() => setShowActions(showActions === notification.id ? null : notification.id)}
                      className="p-1 hover:bg-white/10 rounded transition-colors"
                    >
                      <MoreVertical className="h-4 w-4 text-white/60" />
                    </button>
                    
                    {showActions === notification.id && (
                      <div className="absolute right-0 top-full mt-1 bg-gray-800/95 backdrop-blur-md rounded-lg border border-white/20 shadow-xl z-10 min-w-40">
                        {!notification.read && (
                          <button
                            onClick={() => {
                              onMarkAsRead(notification.id);
                              setShowActions(null);
                            }}
                            className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
                          >
                            <Check className="h-4 w-4" />
                            <span>Mark as Read</span>
                          </button>
                        )}
                        
                        <button
                          onClick={() => {
                            onSnoozeNotification(notification.id, new Date(Date.now() + 60 * 60 * 1000));
                            setShowActions(null);
                          }}
                          className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
                        >
                          <Clock className="h-4 w-4" />
                          <span>Snooze 1 hour</span>
                        </button>
                        
                        <div className="border-t border-white/20 my-1"></div>
                        
                        <button
                          onClick={() => {
                            onDeleteNotification(notification.id);
                            setShowActions(null);
                          }}
                          className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AlertList;