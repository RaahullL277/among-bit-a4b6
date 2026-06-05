import { useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { api } from '../api/client';
import { useStores } from '../context/StoreContext';
import { useAsync } from '../hooks/useAsync';
import {
  Card,
  CardHeader,
  Spinner,
  ErrorBanner,
  Badge,
  EmptyState,
  formatMoney,
} from '../components/ui';

const STATUSES = ['PENDING', 'PAID', 'FULFILLED', 'CANCELLED', 'REFUNDED'];

export default function Orders() {
  const { selectedId, selectedStore } = useStores();
  const [updating, setUpdating] = useState('');
  const [error, setError] = useState('');

  const { data: orders, loading, error: loadError, reload } = useAsync(
    () => (selectedId ? api.orders.list(selectedId) : Promise.resolve([])),
    [selectedId],
  );

  async function changeStatus(id, status) {
    setUpdating(id);
    setError('');
    try {
      await api.orders.updateStatus(id, status);
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdating('');
    }
  }

  if (!selectedId) {
    return (
      <Card>
        <EmptyState icon={ShoppingCart} title="Select a store">
          Choose a store from the switcher above to view its orders.
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-slate-900">Orders</h1>
      <ErrorBanner message={error} />

      <Card>
        <CardHeader title={selectedStore?.name} subtitle="Orders in this store" />
        {loading ? (
          <Spinner />
        ) : loadError ? (
          <div className="p-5">
            <ErrorBanner message={loadError} />
          </div>
        ) : orders?.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="No orders yet">
            Orders created via checkout (API or MCP) will appear here.
          </EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-5 py-3 font-medium">Order</th>
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Items</th>
                <th className="px-5 py-3 font-medium">Total</th>
                <th className="px-5 py-3 font-medium">Payment</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders?.map((o) => (
                <tr key={o.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-3 font-medium text-slate-900">#{o.number}</td>
                  <td className="px-5 py-3 text-slate-600">{o.customer?.name ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-500">{o.items?.length ?? 0}</td>
                  <td className="px-5 py-3 text-slate-700">{formatMoney(o.totalMinor, o.currency)}</td>
                  <td className="px-5 py-3">{o.payment ? <Badge>{o.payment.status}</Badge> : '—'}</td>
                  <td className="px-5 py-3">
                    <select
                      value={o.status}
                      disabled={updating === o.id}
                      onChange={(e) => changeStatus(o.id, e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-indigo-500 disabled:opacity-50"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
