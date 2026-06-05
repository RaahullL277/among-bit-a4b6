import { useState } from 'react';
import { Plus, Store as StoreIcon } from 'lucide-react';
import { api } from '../api/client';
import { useStores } from '../context/StoreContext';
import {
  Button,
  Card,
  Field,
  Input,
  Select,
  Modal,
  Spinner,
  ErrorBanner,
  Badge,
  EmptyState,
} from '../components/ui';

export default function Stores() {
  const { stores, loading, refreshStores } = useStores();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', currency: 'INR' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function create(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.stores.create({
        name: form.name,
        slug: form.slug || undefined,
        currency: form.currency,
      });
      setOpen(false);
      setForm({ name: '', slug: '', currency: 'INR' });
      await refreshStores();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Stores</h1>
        <Button onClick={() => setOpen(true)}>
          <Plus size={15} /> New store
        </Button>
      </div>

      {loading ? (
        <Spinner />
      ) : stores.length === 0 ? (
        <Card>
          <EmptyState icon={StoreIcon} title="No stores yet">
            Create your first storefront to start adding products.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((s) => (
            <Card key={s.id} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-slate-900">{s.name}</div>
                  <div className="text-xs text-slate-500">/{s.slug}</div>
                </div>
                <Badge>{s.status}</Badge>
              </div>
              <div className="mt-4 flex gap-4 text-xs text-slate-500">
                <span>{s.currency}</span>
                <span>{s.country}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New store">
        <form onSubmit={create} className="space-y-4">
          <Field label="Name">
            <Input
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Spice Route"
            />
          </Field>
          <Field label="Slug" hint="Optional — derived from the name if left blank.">
            <Input
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder="spice-route"
            />
          </Field>
          <Field label="Currency">
            <Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              <option value="INR">INR</option>
              <option value="USD">USD</option>
            </Select>
          </Field>
          <ErrorBanner message={error} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={!form.name.trim()}>
              Create store
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
