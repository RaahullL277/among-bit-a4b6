import { useState } from 'react';
import { ShoppingCart, IndianRupee, CheckCircle2, Users, TrendingUp } from 'lucide-react';
import {
  AreaChart,
  Area,
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
import { Card, CardHeader, Spinner, ErrorBanner, formatMoney, EmptyState, Select } from '../components/ui';

const RANGES = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

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
  const { selectedId, selectedStore, stores } = useStores();
  const [days, setDays] = useState(30);
  const from = new Date(Date.now() - days * 86400000).toISOString();
  const storeId = selectedId || undefined;
  const interval = days > 31 ? 'week' : 'day';

  const { data: summary, loading, error } = useAsync(
    () => api.analytics.summary(storeId, from),
    [storeId, from],
  );
  const { data: revenue } = useAsync(() => api.analytics.revenue(storeId, from, interval), [storeId, from, interval]);
  const { data: funnel } = useAsync(() => api.analytics.funnel(storeId, from), [storeId, from]);
  const { data: top } = useAsync(() => api.analytics.topProducts(storeId, from, 5), [storeId, from]);

  if (loading) return <Spinner />;

  const revenueData = (revenue ?? []).map((b) => ({ date: b.date.slice(5), revenue: b.revenueMinor / 100 }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Dashboard</h1>
          <p className="text-xs text-slate-500">{stores.length ? selectedStore?.name ?? 'All stores' : ''}</p>
        </div>
        <div className="w-40">
          <Select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {RANGES.map((r) => (
              <option key={r.days} value={r.days}>{r.label}</option>
            ))}
          </Select>
        </div>
      </div>
      <ErrorBanner message={error} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={IndianRupee} label="Revenue (paid)" value={formatMoney(summary?.revenueMinor)} tint="bg-amber-50 text-amber-600" />
        <Stat icon={CheckCircle2} label="Paid orders" value={summary?.paidOrders ?? 0} tint="bg-emerald-50 text-emerald-600" />
        <Stat icon={TrendingUp} label="Avg order value" value={formatMoney(summary?.averageOrderValueMinor)} tint="bg-indigo-50 text-indigo-600" />
        <Stat icon={Users} label="New customers" value={summary?.newCustomers ?? 0} tint="bg-blue-50 text-blue-600" />
      </div>

      <Card>
        <CardHeader title="Revenue" subtitle={`Paid orders · ${interval}`} />
        <div className="p-5">
          {revenueData.some((d) => d.revenue > 0) ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip formatter={(v) => formatMoney(v * 100)} />
                <Area type="monotone" dataKey="revenue" stroke="#6366f1" fill="url(#rev)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={IndianRupee} title="No revenue in this period">
              Paid orders will plot here.
            </EmptyState>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Conversion funnel" subtitle="Cart → checkout → paid" />
          <div className="p-5">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={funnel ?? []} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis type="category" dataKey="stage" tick={{ fontSize: 12 }} stroke="#94a3b8" width={70} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Top products" subtitle="By revenue" />
          {top?.length ? (
            <table className="w-full text-sm">
              <tbody>
                {top.map((p) => (
                  <tr key={p.productId} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-3 font-medium text-slate-900">{p.title}</td>
                    <td className="px-5 py-3 text-right text-slate-500">{p.units} sold</td>
                    <td className="px-5 py-3 text-right font-medium text-slate-800">{formatMoney(p.revenueMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState icon={TrendingUp} title="No sales yet" />
          )}
        </Card>
      </div>
    </div>
  );
}
