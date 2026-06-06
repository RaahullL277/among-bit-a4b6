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
  Button,
  Field,
  Input,
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

      <CheckoutSettings storeId={selectedId} />

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

function CheckoutSettings({ storeId }) {
  const { data, loading, reload } = useAsync(() => api.checkoutSettings.get(storeId), [storeId]);
  const [form, setForm] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  if (loading || !data) return null;
  const p = form ?? data;
  const set = (k, v) => { setForm({ ...p, [k]: v }); setSaved(false); };
  async function save() {
    setBusy(true);
    try {
      await api.checkoutSettings.set({
        storeId,
        taxBps: Math.round(Number(p.taxBps) || 0),
        taxLabel: p.taxLabel || 'Tax',
        pricesIncludeTax: !!p.pricesIncludeTax,
        flatShippingMinor: Math.round((Number(p.flatShippingRupees ?? p.flatShippingMinor / 100) || 0) * 100),
        freeShippingOverMinor: p.freeShippingOverRupees ? Math.round(Number(p.freeShippingOverRupees) * 100) : (p.freeShippingOverMinor ?? null),
        requireAddress: !!p.requireAddress,
        requireLegalAcceptance: !!p.requireLegalAcceptance,
      });
      setForm(null); setSaved(true); reload();
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-5 py-4 text-left">
        <div>
          <div className="text-sm font-semibold text-slate-900">Checkout · tax &amp; shipping</div>
          <div className="text-xs text-slate-400">
            {data.taxBps ? `${(data.taxBps / 100).toFixed(2)}% ${data.taxLabel}${data.pricesIncludeTax ? ' (incl.)' : ''}` : 'No tax'} ·
            {data.flatShippingMinor ? ` ₹${(data.flatShippingMinor / 100).toFixed(0)} shipping` : ' Free shipping'} ·
            {data.requireAddress ? ' address required' : ' address optional'}
          </div>
        </div>
        <span className="text-xs text-indigo-600">{open ? 'Hide' : 'Edit'}</span>
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-4 border-t border-slate-100 p-5 md:grid-cols-3">
          <Field label="Tax rate (%)" hint="e.g. 18 for GST">
            <Input type="number" min={0} max={100} step="0.5" value={(p.taxBps ?? 0) / 100} onChange={(e) => set('taxBps', Math.round(Number(e.target.value) * 100))} />
          </Field>
          <Field label="Tax label"><Input value={p.taxLabel ?? 'Tax'} onChange={(e) => set('taxLabel', e.target.value)} /></Field>
          <Field label="Prices include tax?">
            <Toggle on={p.pricesIncludeTax} onClick={() => set('pricesIncludeTax', !p.pricesIncludeTax)} />
          </Field>
          <Field label="Flat shipping (₹)">
            <Input type="number" min={0} value={p.flatShippingRupees ?? (p.flatShippingMinor / 100)} onChange={(e) => set('flatShippingRupees', e.target.value)} />
          </Field>
          <Field label="Free shipping over (₹)" hint="blank = never">
            <Input type="number" min={0} value={p.freeShippingOverRupees ?? (p.freeShippingOverMinor != null ? p.freeShippingOverMinor / 100 : '')} onChange={(e) => set('freeShippingOverRupees', e.target.value)} />
          </Field>
          <Field label="Require delivery address?" hint="On for physical goods">
            <Toggle on={p.requireAddress} onClick={() => set('requireAddress', !p.requireAddress)} />
          </Field>
          <Field label="Require policy acceptance?" hint="Buyer must accept terms & privacy">
            <Toggle on={p.requireLegalAcceptance} onClick={() => set('requireLegalAcceptance', !p.requireLegalAcceptance)} />
          </Field>
          <div className="md:col-span-3 flex items-center gap-3">
            <Button onClick={save} loading={busy} disabled={!form}>Save</Button>
            {saved && <span className="text-sm text-emerald-600">Saved.</span>}
          </div>
        </div>
      )}
    </Card>
  );
}

function Toggle({ on, onClick }) {
  return (
    <button onClick={onClick} className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${on ? 'bg-indigo-600' : 'bg-slate-300'}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${on ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}
