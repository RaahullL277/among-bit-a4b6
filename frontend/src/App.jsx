import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { StoreProvider } from './context/StoreContext';
import LoginGate from './components/LoginGate';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Stores from './pages/Stores';
import Products from './pages/Products';
import Orders from './pages/Orders';
import Customers from './pages/Customers';
import Integrations from './pages/Integrations';
import Notifications from './pages/Notifications';
import Team from './pages/Team';
import Settings from './pages/Settings';
import { Spinner } from './components/ui';

function AuthedApp() {
  return (
    <StoreProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/stores" element={<Stores />} />
          <Route path="/products" element={<Products />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/team" element={<Team />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </StoreProvider>
  );
}

function Root() {
  const { isAuthed, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <Spinner label="Loading…" />
      </div>
    );
  }
  return isAuthed ? <AuthedApp /> : <LoginGate />;
}

export default function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}
