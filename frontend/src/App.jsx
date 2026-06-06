import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import TaskManager from './pages/TaskManager';
import CalendarSync from './pages/CalendarSync';
import Collaboration from './pages/Collaboration';
import Notifications from './pages/Notifications';
import NudgeOpsDashboard from './pages/nudgeops/NudgeOpsDashboard';
import CampaignCreator from './pages/nudgeops/CampaignCreator';
import CampaignMonitor from './pages/nudgeops/CampaignMonitor';
import ApprovalQueue from './pages/nudgeops/ApprovalQueue';
import AnalyticsDashboard from './pages/nudgeops/AnalyticsDashboard';

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
        <Route path="/nudgeops" element={<NudgeOpsDashboard />} />
        <Route path="/nudgeops/campaigns/new" element={<CampaignCreator />} />
        <Route path="/nudgeops/monitor" element={<CampaignMonitor />} />
        <Route path="/nudgeops/approvals" element={<ApprovalQueue />} />
        <Route path="/nudgeops/analytics" element={<AnalyticsDashboard />} />
      </Routes>
    </div>
  );
}

export default App;