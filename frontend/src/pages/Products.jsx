import { useState } from 'react';
import { Plus, Package } from 'lucide-react';
import { api } from '../api/client';
import { useStores } from '../context/StoreContext';
import { useAsync } from '../hooks/useAsync';
import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Textarea,
  Select,
  Modal,
  Spinner,
  ErrorBanner,
  Badge,
  EmptyState,
  formatMoney,
} from '../components/ui';

const emptyForm = { title: '', description: '', status: 'ACTIVE', price: '', sku: '', inventory: '' };

export default function Products() {
  const { selectedId, selectedStore } = useStores();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: products, loading, error: loadError, reload } = useAsync(
    () => (selectedId ? api.products.list(selectedId) : Promise.resolve([])),
    [selectedId],
  );

  async function create(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      // Rupees in the form → paise (minor units) for the API.
      const priceMinor = Math.round(parseFloat(form.price || '0') * 100);
      await api.products.create({
        storeId: selectedId,
        title: form.title,
        description: form.description || undefined,
        status: form.status,
        variants: [
          {
            priceMinor,
            sku: form.sku || undefined,
            inventory: form.inventory ? parseInt(form.inventory, 10) : 0,
          },
        ],
      });
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
        <EmptyState icon={Package} title="Select a store">
          Choose a store from the switcher above to manage its products.
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Products</h1>
        <Button onClick={() => setOpen(true)}>
          <Plus size={15} /> New product
        </Button>
      </div>

      <Card>
        <CardHeader title={selectedStore?.name} subtitle="Products in this store" />
        {loading ? (
          <Spinner />
        ) : loadError ? (
          <div className="p-5">
            <ErrorBanner message={loadError} />
          </div>
        ) : products?.length === 0 ? (
          <EmptyState icon={Package} title="No products yet">
            Add a product to start selling.
          </EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-5 py-3 font-medium">Product</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Price</th>
                <th className="px-5 py-3 font-medium">SKU</th>
                <th className="px-5 py-3 font-medium">Inventory</th>
              </tr>
            </thead>
            <tbody>
              {products?.map((p) => {
                const v = p.variants?.[0];
                return (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-900">{p.title}</div>
                      {p.description && <div className="text-xs text-slate-400">{p.description}</div>}
                    </td>
                    <td className="px-5 py-3">
                      <Badge>{p.status}</Badge>
                    </td>
                    <td className="px-5 py-3 text-slate-700">{v ? formatMoney(v.priceMinor, v.currency) : '—'}</td>
                    <td className="px-5 py-3 text-slate-500">{v?.sku ?? '—'}</td>
                    <td className="px-5 py-3 text-slate-500">{v?.inventory ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="New product">
        <form onSubmit={create} className="space-y-4">
          <Field label="Title">
            <Input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Description">
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price (₹)">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="249.00"
              />
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="ACTIVE">Active</option>
                <option value="DRAFT">Draft</option>
                <option value="ARCHIVED">Archived</option>
              </Select>
            </Field>
            <Field label="SKU">
              <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </Field>
            <Field label="Inventory">
              <Input
                type="number"
                min="0"
                value={form.inventory}
                onChange={(e) => setForm({ ...form, inventory: e.target.value })}
              />
            </Field>
          </div>
          <ErrorBanner message={error} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={!form.title.trim() || !form.price}>
              Create product
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
