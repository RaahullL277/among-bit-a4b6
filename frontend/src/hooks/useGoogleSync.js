import { useState, useEffect, useCallback } from 'react';

const useGoogleSync = () => {
  const [syncStatus, setSyncStatus] = useState('disconnected');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [syncData, setSyncData] = useState(null);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    checkSyncStatus();
  }, []);

  const checkSyncStatus = useCallback(async () => {
    try {
      setLoading(true);
      
      // TODO: Connect to the backend API when ready.
      // const response = await fetch('http://localhost:8000/api/google-sync/status');
      // const data = await response.json();
      // setSyncStatus(data.status);
      // setIsAuthorized(data.isAuthorized);
      // setLastSyncTime(data.lastSyncTime);

      // Using mock data for now
      setTimeout(() => {
        const mockStatus = {
          status: 'connected',
          isAuthorized: true,
          lastSyncTime: '2024-01-15T10:30:00Z',
          calendarCount: 3,
          eventCount: 47
        };
        
        setSyncStatus(mockStatus.status);
        setIsAuthorized(mockStatus.isAuthorized);
        setLastSyncTime(mockStatus.lastSyncTime);
        setSyncData({
          calendarCount: mockStatus.calendarCount,
          eventCount: mockStatus.eventCount
        });
        setLoading(false);
      }, 1000);
      
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, []);

  const initiateSync = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // TODO: Connect to the backend API when ready.
      // const response = await fetch('http://localhost:8000/api/google-sync/connect', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' }
      // });
      // const data = await response.json();
      // if (data.authUrl) {
      //   window.location.href = data.authUrl;
      // }

      // Using mock data for now
      setTimeout(() => {
        setSyncStatus('connecting');
        setTimeout(() => {
          setSyncStatus('connected');
          setIsAuthorized(true);
          setLastSyncTime(new Date().toISOString());
          setSyncData({
            calendarCount: 3,
            eventCount: 47
          });
          setLoading(false);
        }, 2000);
      }, 1000);
      
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, []);

  const disconnectSync = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // TODO: Connect to the backend API when ready.
      // const response = await fetch('http://localhost:8000/api/google-sync/disconnect', {
      //   method: 'DELETE'
      // });

      // Using mock data for now
      setTimeout(() => {
        setSyncStatus('disconnected');
        setIsAuthorized(false);
        setLastSyncTime(null);
        setSyncData(null);
        setLoading(false);
      }, 1000);
      
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, []);

  const syncNow = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // TODO: Connect to the backend API when ready.
      // const response = await fetch('http://localhost:8000/api/google-sync/sync-now', {
      //   method: 'POST'
      // });
      // const data = await response.json();

      // Using mock data for now
      setTimeout(() => {
        setLastSyncTime(new Date().toISOString());
        setSyncData(prev => ({
          ...prev,
          eventCount: (prev?.eventCount || 0) + Math.floor(Math.random() * 5)
        }));
        setLoading(false);
      }, 2000);
      
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, []);

  return {
    syncStatus,
    loading,
    error,
    syncData,
    lastSyncTime,
    isAuthorized,
    checkSyncStatus,
    initiateSync,
    disconnectSync,
    syncNow
  };
};

export default useGoogleSync;