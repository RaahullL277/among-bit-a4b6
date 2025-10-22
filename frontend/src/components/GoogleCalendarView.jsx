import React, { useState } from 'react';
import { Calendar, Clock, MapPin, Users, ChevronLeft, ChevronRight, Eye, EyeOff, Filter, List, Grid } from 'lucide-react';

const GoogleCalendarView = ({ 
  calendars, 
  events, 
  selectedCalendars, 
  onToggleCalendar, 
  loading, 
  dateRange,
  onDateRangeChange 
}) => {
  const [viewMode, setViewMode] = useState('list');
  const [showAllCalendars, setShowAllCalendars] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState(new Date());

  const formatEventTime = (start, end, isAllDay) => {
    if (isAllDay) return 'All Day';
    
    const startTime = new Date(start).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    const endTime = new Date(end).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    return `${startTime} - ${endTime}`;
  };

  const formatEventDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const groupEventsByDate = (events) => {
    const grouped = {};
    events.forEach(event => {
      const date = new Date(event.start).toDateString();
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(event);
    });
    return grouped;
  };

  const getWeekDays = (startDate) => {
    const days = [];
    const start = new Date(startDate);
    start.setDate(start.getDate() - start.getDay());
    
    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const navigateWeek = (direction) => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() + (direction * 7));
    setCurrentWeekStart(newStart);
  };

  const getEventsForDate = (date) => {
    const dateString = date.toDateString();
    return events.filter(event => {
      const eventDate = new Date(event.start).toDateString();
      return eventDate === dateString;
    });
  };

  if (loading) {
    return (
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 animate-pulse">
        <div className="space-y-4">
          <div className="h-6 bg-white/20 rounded w-1/3"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white/10 rounded-lg p-4">
                <div className="h-4 bg-white/20 rounded mb-2 w-3/4"></div>
                <div className="h-3 bg-white/10 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const groupedEvents = groupEventsByDate(events);
  const weekDays = getWeekDays(currentWeekStart);

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-lg">
      {/* Header */}
      <div className="p-6 border-b border-white/20">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white flex items-center space-x-2">
            <Calendar className="h-5 w-5" />
            <span>Google Calendar Events</span>
          </h2>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
              className="flex items-center space-x-2 px-3 py-2 bg-white/10 text-white/80 rounded-lg border border-white/20 hover:bg-white/20 transition-colors"
            >
              {viewMode === 'list' ? <Grid className="h-4 w-4" /> : <List className="h-4 w-4" />}
              <span className="capitalize">{viewMode === 'list' ? 'Grid' : 'List'} View</span>
            </button>
            
            <button
              onClick={() => setShowAllCalendars(!showAllCalendars)}
              className="flex items-center space-x-2 px-3 py-2 bg-white/10 text-white/80 rounded-lg border border-white/20 hover:bg-white/20 transition-colors"
            >
              <Filter className="h-4 w-4" />
              <span>{showAllCalendars ? 'Hide' : 'Show'} Calendars</span>
            </button>
          </div>
        </div>
        
        {/* Date Range */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-white/60">
            Showing events from {new Date(dateRange.start).toLocaleDateString()} to {new Date(dateRange.end).toLocaleDateString()}
          </div>
          <div className="text-sm text-white/60">
            {events.length} events found
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Calendar List Sidebar */}
          {showAllCalendars && (
            <div className="lg:col-span-1">
              <h3 className="text-lg font-semibold text-white mb-4">Calendars</h3>
              <div className="space-y-2">
                {calendars.map((calendar) => (
                  <div
                    key={calendar.id}
                    className="flex items-center space-x-3 p-3 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors"
                  >
                    <button
                      onClick={() => onToggleCalendar(calendar.id)}
                      className="flex items-center space-x-2 flex-1"
                    >
                      {selectedCalendars.includes(calendar.id) ? (
                        <Eye className="h-4 w-4 text-green-400" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      )}
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: calendar.color }}
                      ></div>
                      <div className="flex-1 text-left">
                        <div className="font-medium text-white text-sm">{calendar.name}</div>
                        <div className="text-xs text-white/60">{calendar.eventCount} events</div>
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Events Display */}
          <div className={showAllCalendars ? 'lg:col-span-3' : 'lg:col-span-4'}>
            {viewMode === 'list' ? (
              /* List View */
              <div className="space-y-6">
                {Object.keys(groupedEvents).length === 0 ? (
                  <div className="text-center py-12">
                    <Calendar className="h-12 w-12 text-white/40 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-white mb-2">No Events Found</h3>
                    <p className="text-white/60">No events found for the selected calendars and date range.</p>
                  </div>
                ) : (
                  Object.entries(groupedEvents)
                    .sort(([dateA], [dateB]) => new Date(dateA) - new Date(dateB))
                    .map(([date, dayEvents]) => (
                      <div key={date} className="space-y-3">
                        <h3 className="text-lg font-semibold text-white border-b border-white/20 pb-2">
                          {formatEventDate(date)}
                        </h3>
                        <div className="space-y-3">
                          {dayEvents.map((event) => (
                            <div
                              key={event.id}
                              className="bg-white/5 rounded-lg p-4 border-l-4 hover:bg-white/10 transition-colors"
                              style={{ borderLeftColor: event.color }}
                            >
                              <div className="flex items-start justify-between mb-2">
                                <h4 className="font-semibold text-white">{event.title}</h4>
                                <span className="text-xs px-2 py-1 bg-white/20 text-white/80 rounded-full">
                                  {event.calendarName}
                                </span>
                              </div>
                              
                              {event.description && (
                                <p className="text-sm text-white/70 mb-3">{event.description}</p>
                              )}
                              
                              <div className="flex items-center space-x-4 text-sm text-white/60">
                                <div className="flex items-center space-x-1">
                                  <Clock className="h-4 w-4" />
                                  <span>{formatEventTime(event.start, event.end, event.isAllDay)}</span>
                                </div>
                                
                                {event.location && (
                                  <div className="flex items-center space-x-1">
                                    <MapPin className="h-4 w-4" />
                                    <span>{event.location}</span>
                                  </div>
                                )}
                                
                                {event.attendees.length > 0 && (
                                  <div className="flex items-center space-x-1">
                                    <Users className="h-4 w-4" />
                                    <span>{event.attendees.length} attendees</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                )}
              </div>
            ) : (
              /* Grid/Week View */
              <div className="space-y-4">
                {/* Week Navigation */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => navigateWeek(-1)}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5 text-white/70" />
                  </button>
                  
                  <h3 className="text-lg font-semibold text-white">
                    Week of {weekDays[0].toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                  </h3>
                  
                  <button
                    onClick={() => navigateWeek(1)}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <ChevronRight className="h-5 w-5 text-white/70" />
                  </button>
                </div>
                
                {/* Week Grid */}
                <div className="grid grid-cols-7 gap-2">
                  {weekDays.map((day, index) => {
                    const dayEvents = getEventsForDate(day);
                    const isToday = day.toDateString() === new Date().toDateString();
                    
                    return (
                      <div key={index} className={`bg-white/5 rounded-lg p-3 border border-white/10 min-h-32 ${
                        isToday ? 'ring-2 ring-blue-400/50' : ''
                      }`}>
                        <div className={`text-sm font-medium mb-2 ${
                          isToday ? 'text-blue-400' : 'text-white/80'
                        }`}>
                          {day.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                        </div>
                        
                        <div className="space-y-1">
                          {dayEvents.slice(0, 3).map((event) => (
                            <div
                              key={event.id}
                              className="text-xs p-1 rounded border-l-2 bg-white/10"
                              style={{ borderLeftColor: event.color }}
                            >
                              <div className="font-medium text-white truncate">{event.title}</div>
                              <div className="text-white/60">
                                {formatEventTime(event.start, event.end, event.isAllDay)}
                              </div>
                            </div>
                          ))}
                          {dayEvents.length > 3 && (
                            <div className="text-xs text-white/60 text-center py-1">
                              +{dayEvents.length - 3} more
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GoogleCalendarView;