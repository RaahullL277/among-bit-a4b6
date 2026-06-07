import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { StoreProvider } from './context/StoreContext';
import LoginGate from './components/LoginGate';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Stores from './pages/Stores';
import Products from './pages/Products';
import QuickList from './pages/QuickList';
import Orders from './pages/Orders';
import Carts from './pages/Carts';
import Shipments from './pages/Shipments';
import Returns from './pages/Returns';
import Invoicing from './pages/Invoicing';
import Legal from './pages/Legal';
import ImportPage from './pages/Import';
import Stock from './pages/Stock';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import Cohorts from './pages/Cohorts';
import Automation from './pages/Automation';
import Shopability from './pages/Shopability';
import Integrations from './pages/Integrations';
import Apps from './pages/Apps';
import Notifications from './pages/Notifications';
import Support from './pages/Support';
import Reviews from './pages/Reviews';
import Bundles from './pages/Bundles';
import Discounts from './pages/Discounts';
import Loyalty from './pages/Loyalty';
import Subscriptions from './pages/Subscriptions';
import Design from './pages/Design';
import Seo from './pages/Seo';
import Images from './pages/Images';
import Marketing from './pages/Marketing';
import Pricing from './pages/Pricing';
import Team from './pages/Team';
import Audit from './pages/Audit';
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
          <Route path="/quick-list" element={<QuickList />} />
          <Route path="/stock" element={<Stock />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/carts" element={<Carts />} />
          <Route path="/shipments" element={<Shipments />} />
          <Route path="/returns" element={<Returns />} />
          <Route path="/invoicing" element={<Invoicing />} />
          <Route path="/legal" element={<Legal />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/cohorts" element={<Cohorts />} />
          <Route path="/automation" element={<Automation />} />
          <Route path="/shopability" element={<Shopability />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/apps" element={<Apps />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/support" element={<Support />} />
          <Route path="/reviews" element={<Reviews />} />
          <Route path="/bundles" element={<Bundles />} />
          <Route path="/discounts" element={<Discounts />} />
          <Route path="/loyalty" element={<Loyalty />} />
          <Route path="/subscriptions" element={<Subscriptions />} />
          <Route path="/design" element={<Design />} />
          <Route path="/seo" element={<Seo />} />
          <Route path="/images" element={<Images />} />
          <Route path="/marketing" element={<Marketing />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/team" element={<Team />} />
          <Route path="/audit" element={<Audit />} />
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
