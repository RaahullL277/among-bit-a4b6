import { useState } from 'react';
import { Truck, Plus, ExternalLink } from 'lucide-react';
import { api } from '../api/client';
import { useStores } from '../context/StoreContext';
import { useAsync } from '../hooks/useAsync';
import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
  Modal,
  Spinner,
  ErrorBanner,
  Badge,
  EmptyState,
} from '../components/ui';

const emptyAddr = { name: '', phone: '', line1: '', city: '', state: '', pincode: '' };

export default function Shipments() {
  const { selectedId, selectedStore } = useStores();
  const { data: shipments, loading, error, reload } = useAsync(
    () => (selectedId ? api.shipments.list(selectedId) : Promise.resolve([])),
    [selectedId],
  );
  const { data: orders } = useAsync(
    () => (selectedId ? api.orders.list(selectedId) : Promise.resolve([])),
    [selectedId],
  );

  const [open, setOpen] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [addr, setAddr] = useState(emptyAddr);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Orders that don't already have a shipment.
  const shippedOrderIds = new Set((shipments ?? []).map((s) => s.orderId));
  const shippableOrders = (orders ?? []).filter((o) => !shippedOrderIds.has(o.id));

  async function create(e) {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      await api.shipments.create({ orderId, to: addr });
      setOpen(false);
      setOrderId('');
      setAddr(emptyAddr);
      reload();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function cancel(id) {
    await api.shipments.cancel(id);
    reload();
  }

  if (!selectedId) {
    return (
      <Card>
        <EmptyState icon={Truck} title="Select a store">
          Choose a store from the switcher above to manage shipments.
        </EmptyState>
      </Card>
    );
  }

  const set = (k) => (e) => setAddr({ ...addr, [k]: e.target.value });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Shipments</h1>
        <Button onClick={() => setOpen(true)}>
          <Plus size={15} /> Create shipment
        </Button>
      </div>

      <Card>
        <CardHeader title={selectedStore?.name} subtitle="Shipments and tracking" />
        {loading ? (
          <Spinner />
        ) : error ? (
          <div className="p-5"><ErrorBanner message={error} /></div>
        ) : shipments?.length === 0 ? (
          <EmptyState icon={Truck} title="No shipments yet">
            Create a shipment for a paid order to fulfil it.
          </EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-5 py-3 font-medium">AWB</th>
                <th className="px-5 py-3 font-medium">Courier</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Latest update</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {shipments?.map((s) => (
                <tr key={s.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-3 font-mono text-xs text-slate-700">
                    {s.trackingUrl ? (
                      <a href={s.trackingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
                        {s.awb} <ExternalLink size={12} />
                      </a>
                    ) : (
                      s.awb ?? '—'
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{s.courier ?? '—'}</td>
                  <td className="px-5 py-3"><Badge>{s.status}</Badge></td>
                  <td className="px-5 py-3 text-xs text-slate-500">
                    {s.events?.[0]?.description ?? '—'}
                    {s.events?.[0]?.location ? ` · ${s.events[0].location}` : ''}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {!['DELIVERED', 'CANCELLED'].includes(s.status) && (
                      <button onClick={() => cancel(s.id)} className="text-xs text-rose-600 hover:text-rose-700">
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Create shipment">
        <form onSubmit={create} className="space-y-4">
          <Field label="Order">
            <Select value={orderId} onChange={(e) => setOrderId(e.target.value)}>
              <option value="">Select an order…</option>
              {shippableOrders.map((o) => (
                <option key={o.id} value={o.id}>
                  #{o.number} · {o.status} · {(o.totalMinor / 100).toFixed(2)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Recipient name"><Input value={addr.name} onChange={set('name')} /></Field>
            <Field label="Phone"><Input value={addr.phone} onChange={set('phone')} /></Field>
          </div>
          <Field label="Address line"><Input value={addr.line1} onChange={set('line1')} placeholder="12 MG Road" /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="City"><Input value={addr.city} onChange={set('city')} /></Field>
            <Field label="State"><Input value={addr.state} onChange={set('state')} /></Field>
            <Field label="Pincode"><Input value={addr.pincode} onChange={set('pincode')} /></Field>
          </div>
          <ErrorBanner message={formError} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving} disabled={!orderId || (!addr.line1 && !addr.pincode)}>
              Create shipment
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
