import { Store, ShoppingCart, IndianRupee, CheckCircle2 } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { api } from '../api/client';
import { useStores } from '../context/StoreContext';
import { useAsync } from '../hooks/useAsync';
import { Card, CardHeader, Spinner, ErrorBanner, formatMoney, EmptyState } from '../components/ui';

const STATUSES = ['PENDING', 'PAID', 'FULFILLED', 'CANCELLED', 'REFUNDED'];

function Stat({ icon: Icon, label, value, tint }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tint}`}>
          <Icon size={18} />
        </div>
        <div>
          <div className="text-xs font-medium text-slate-500">{label}</div>
          <div className="text-xl font-semibold text-slate-900">{value}</div>
        </div>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { stores } = useStores();
  const { data: orders, loading, error } = useAsync(() => api.orders.list(), []);

  if (loading) return <Spinner />;

  const paid = (orders ?? []).filter((o) => ['PAID', 'FULFILLED'].includes(o.status));
  const revenue = paid.reduce((sum, o) => sum + o.totalMinor, 0);
  const byStatus = STATUSES.map((status) => ({
    status,
    count: (orders ?? []).filter((o) => o.status === status).length,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-slate-900">Dashboard</h1>
      <ErrorBanner message={error} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Store} label="Stores" value={stores.length} tint="bg-indigo-50 text-indigo-600" />
        <Stat icon={ShoppingCart} label="Orders" value={orders?.length ?? 0} tint="bg-blue-50 text-blue-600" />
        <Stat icon={CheckCircle2} label="Paid orders" value={paid.length} tint="bg-emerald-50 text-emerald-600" />
        <Stat icon={IndianRupee} label="Revenue (paid)" value={formatMoney(revenue)} tint="bg-amber-50 text-amber-600" />
      </div>

      <Card>
        <CardHeader title="Orders by status" subtitle="Across all stores" />
        <div className="p-5">
          {orders?.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byStatus}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="status" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={ShoppingCart} title="No orders yet">
              Create a checkout via the API or MCP tools to see orders appear here.
            </EmptyState>
          )}
        </div>
      </Card>
    </div>
  );
}
