import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Users } from 'lucide-react';
import { api } from '../api/client';
import { useStores } from '../context/StoreContext';
import { useAsync } from '../hooks/useAsync';
import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Modal,
  Spinner,
  ErrorBanner,
  EmptyState,
  Badge,
  formatMoney,
} from '../components/ui';

const emptyForm = { name: '', email: '', phone: '' };
const SEGMENTS = ['', 'NEW', 'ONE_TIME', 'REPEAT', 'VIP', 'AT_RISK', 'LAPSED'];
const SEGMENT_BADGE = {
  VIP: 'bg-amber-100 text-amber-800',
  REPEAT: 'bg-indigo-100 text-indigo-700',
  ONE_TIME: 'bg-slate-100 text-slate-600',
  NEW: 'bg-emerald-100 text-emerald-700',
  AT_RISK: 'bg-orange-100 text-orange-700',
  LAPSED: 'bg-rose-100 text-rose-700',
};

function Kpi({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

export default function Customers() {
  const { selectedId, selectedStore } = useStores();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState('');

  const { data: summary } = useAsync(
    () => (selectedId ? api.customers.summary(selectedId) : Promise.resolve(null)),
    [selectedId],
  );
  const { data: customers, loading, error: loadError, reload } = useAsync(
    () => (selectedId ? api.customers.list(selectedId, search || undefined, segment || undefined) : Promise.resolve([])),
    [selectedId, search, segment],
  );

  async function create(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.customers.create({ storeId: selectedId, ...form });
      setOpen(false);
      setForm(emptyForm);
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!selectedId) {
    return (
      <Card>
        <EmptyState icon={Users} title="Select a store">
          Choose a store from the switcher above to manage its customers.
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Customers</h1>
        <Button onClick={() => setOpen(true)}>
          <Plus size={15} /> New customer
        </Button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Customers" value={summary.customers} />
          <Kpi label="With orders" value={summary.withOrders} />
          <Kpi label="Repeat rate" value={`${summary.repeatRatePct}%`} />
          <Kpi label="Avg lifetime value" value={formatMoney(summary.avgLifetimeValueMinor)} />
        </div>
      )}

      <Card>
        <CardHeader
          title={selectedStore?.name}
          subtitle="Customers, lifetime value & segments"
          action={
            <div className="flex gap-2">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name / email / phone" className="w-56" />
              <select value={segment} onChange={(e) => setSegment(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
                {SEGMENTS.map((s) => <option key={s} value={s}>{s || 'All segments'}</option>)}
              </select>
            </div>
          }
        />
        {loading ? (
          <Spinner />
        ) : loadError ? (
          <div className="p-5"><ErrorBanner message={loadError} /></div>
        ) : customers?.length === 0 ? (
          <EmptyState icon={Users} title="No customers found">
            Add a customer, or they'll be created automatically at checkout.
          </EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Segment</th>
                <th className="px-5 py-3 font-medium">Orders</th>
                <th className="px-5 py-3 font-medium">Lifetime value</th>
                <th className="px-5 py-3 font-medium">Last order</th>
                <th className="px-5 py-3 font-medium">Tags</th>
              </tr>
            </thead>
            <tbody>
              {customers?.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link to={`/customers/${c.id}`} className="font-medium text-indigo-600 hover:underline">{c.name ?? c.email ?? '—'}</Link>
                    <div className="text-xs text-slate-400">{c.email}</div>
                  </td>
                  <td className="px-5 py-3"><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SEGMENT_BADGE[c.segment]}`}>{c.segment}</span></td>
                  <td className="px-5 py-3 text-slate-600">{c.orders}</td>
                  <td className="px-5 py-3 font-medium text-slate-900">{formatMoney(c.totalSpentMinor)}</td>
                  <td className="px-5 py-3 text-slate-500">{c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString() : '—'}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(c.tags ?? []).slice(0, 3).map((t) => <Badge key={t}>{t}</Badge>)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="New customer">
        <form onSubmit={create} className="space-y-4">
          <Field label="Name">
            <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Phone" hint="E.164 format, used for WhatsApp automation.">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+9198…" />
          </Field>
          <ErrorBanner message={error} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>Create customer</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
