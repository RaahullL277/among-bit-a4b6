import { useState, useEffect, useCallback } from 'react';

const useGoogleCalendar = () => {
  const [calendars, setCalendars] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedCalendars, setSelectedCalendars] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchCalendars();
  }, []);

  useEffect(() => {
    if (selectedCalendars.length > 0) {
      fetchEvents();
    }
  }, [selectedCalendars, dateRange]);

  const fetchCalendars = useCallback(async () => {
    try {
      setLoading(true);
      
      // TODO: Connect to the backend API when ready.
      // const response = await fetch('http://localhost:8000/api/google-sync/calendars');
      // const data = await response.json();
      // setCalendars(data.calendars);

      // Using mock data for now
      const mockCalendars = [
        {
          id: 'primary',
          name: 'Primary Calendar',
          description: 'Your main Google Calendar',
          color: '#3174ad',
          selected: true,
          eventCount: 25,
          owner: 'john.doe@gmail.com'
        },
        {
          id: 'work',
          name: 'Work Schedule',
          description: 'Professional meetings and deadlines',
          color: '#d96666',
          selected: true,
          eventCount: 18,
          owner: 'john.doe@company.com'
        },
        {
          id: 'personal',
          name: 'Personal Events',
          description: 'Family and personal activities',
          color: '#42d692',
          selected: false,
          eventCount: 12,
          owner: 'john.doe@gmail.com'
        },
        {
          id: 'holidays',
          name: 'Holidays',
          description: 'US Holidays',
          color: '#ffc107',
          selected: false,
          eventCount: 8,
          owner: 'holidays@google.com'
        }
      ];
      
      setTimeout(() => {
        setCalendars(mockCalendars);
        setSelectedCalendars(mockCalendars.filter(cal => cal.selected).map(cal => cal.id));
        setLoading(false);
      }, 1000);
      
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      
      // TODO: Connect to the backend API when ready.
      // const response = await fetch(`http://localhost:8000/api/google-sync/events?calendars=${selectedCalendars.join(',')}&start=${dateRange.start}&end=${dateRange.end}`);
      // const data = await response.json();
      // setEvents(data.events);

      // Using mock data for now
      const mockEvents = [
        {
          id: '1',
          title: 'Team Standup',
          description: 'Daily team synchronization meeting',
          start: '2024-01-16T09:00:00Z',
          end: '2024-01-16T09:30:00Z',
          calendarId: 'work',
          calendarName: 'Work Schedule',
          color: '#d96666',
          location: 'Conference Room A',
          attendees: ['jane.smith@company.com', 'mike.johnson@company.com'],
          isAllDay: false
        },
        {
          id: '2',
          title: 'Project Review',
          description: 'Quarterly project review with stakeholders',
          start: '2024-01-16T14:00:00Z',
          end: '2024-01-16T15:30:00Z',
          calendarId: 'work',
          calendarName: 'Work Schedule',
          color: '#d96666',
          location: 'Zoom Meeting',
          attendees: ['stakeholder1@company.com', 'stakeholder2@company.com'],
          isAllDay: false
        },
        {
          id: '3',
          title: 'Doctor Appointment',
          description: 'Annual checkup',
          start: '2024-01-17T10:00:00Z',
          end: '2024-01-17T11:00:00Z',
          calendarId: 'primary',
          calendarName: 'Primary Calendar',
          color: '#3174ad',
          location: 'Medical Center',
          attendees: [],
          isAllDay: false
        },
        {
          id: '4',
          title: 'Birthday Party',
          description: 'Sarah\'s birthday celebration',
          start: '2024-01-18T00:00:00Z',
          end: '2024-01-18T23:59:59Z',
          calendarId: 'personal',
          calendarName: 'Personal Events',
          color: '#42d692',
          location: 'Home',
          attendees: [],
          isAllDay: true
        },
        {
          id: '5',
          title: 'Client Presentation',
          description: 'Present Q1 results to key client',
          start: '2024-01-19T13:00:00Z',
          end: '2024-01-19T14:00:00Z',
          calendarId: 'work',
          calendarName: 'Work Schedule',
          color: '#d96666',
          location: 'Client Office',
          attendees: ['client@client.com'],
          isAllDay: false
        }
      ];
      
      setTimeout(() => {
        const filteredEvents = mockEvents.filter(event => 
          selectedCalendars.includes(event.calendarId)
        );
        setEvents(filteredEvents);
        setLoading(false);
      }, 800);
      
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, [selectedCalendars, dateRange]);

  const toggleCalendarSelection = useCallback((calendarId) => {
    setSelectedCalendars(prev => {
      if (prev.includes(calendarId)) {
        return prev.filter(id => id !== calendarId);
      } else {
        return [...prev, calendarId];
      }
    });
  }, []);

  const updateDateRange = useCallback((start, end) => {
    setDateRange({ start, end });
  }, []);

  return {
    calendars,
    events,
    selectedCalendars,
    loading,
    error,
    dateRange,
    fetchCalendars,
    fetchEvents,
    toggleCalendarSelection,
    updateDateRange
  };
};

export default useGoogleCalendar;