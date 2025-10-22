import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import TaskManager from './pages/TaskManager';
import CalendarSync from './pages/CalendarSync';
import Collaboration from './pages/Collaboration';
import Notifications from './pages/Notifications';

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900">
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/tasks" element={<TaskManager />} />
        <Route path="/calendar" element={<CalendarSync />} />
        <Route path="/collaboration" element={<Collaboration />} />
        <Route path="/notifications" element={<Notifications />} />
      </Routes>
    </div>
  );
}

export default App;