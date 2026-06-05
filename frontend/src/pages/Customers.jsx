import { useState } from 'react';
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
} from '../components/ui';

const emptyForm = { name: '', email: '', phone: '' };

export default function Customers() {
  const { selectedId, selectedStore } = useStores();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: customers, loading, error: loadError, reload } = useAsync(
    () => (selectedId ? api.customers.list(selectedId) : Promise.resolve([])),
    [selectedId],
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

      <Card>
        <CardHeader title={selectedStore?.name} subtitle="Customers in this store" />
        {loading ? (
          <Spinner />
        ) : loadError ? (
          <div className="p-5">
            <ErrorBanner message={loadError} />
          </div>
        ) : customers?.length === 0 ? (
          <EmptyState icon={Users} title="No customers yet">
            Add a customer, or they'll be created automatically at checkout.
          </EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Phone</th>
              </tr>
            </thead>
            <tbody>
              {customers?.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-3 font-medium text-slate-900">{c.name ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-600">{c.email ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-600">{c.phone ?? '—'}</td>
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
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Create customer
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
