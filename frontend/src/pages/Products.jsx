import { useState } from 'react';
import { Plus, Package, Sliders } from 'lucide-react';
import { api } from '../api/client';
import { useStores } from '../context/StoreContext';
import { useAsync } from '../hooks/useAsync';
import MerchandiseModal from '../components/MerchandiseModal';
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
  StockDot,
} from '../components/ui';

const emptyForm = { title: '', description: '', status: 'ACTIVE', price: '', sku: '', inventory: '', hsnCode: '', gstRate: '', brand: '', productType: '' };

export default function Products() {
  const { selectedId, selectedStore } = useStores();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [merchFor, setMerchFor] = useState(null);

  const { data: products, loading, error: loadError, reload } = useAsync(
    () => (selectedId ? api.products.list(selectedId) : Promise.resolve([])),
    [selectedId],
  );
  // Stock health per variant, shown as an R/A/G dot next to each product.
  const { data: stock } = useAsync(
    () => (selectedId ? api.stock.status(selectedId) : Promise.resolve([])),
    [selectedId],
  );
  const stockByVariant = new Map((stock ?? []).map((s) => [s.variantId, s.status]));

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
        hsnCode: form.hsnCode || undefined,
        gstRateBps: form.gstRate ? Math.round(parseFloat(form.gstRate) * 100) : undefined,
        brand: form.brand || undefined,
        productType: form.productType || undefined,
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
                <th className="px-5 py-3 font-medium">Stock</th>
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
                    <td className="px-5 py-3 text-slate-700">{v ? <PriceCell variant={v} onSaved={reload} /> : '—'}</td>
                    <td className="px-5 py-3 text-slate-500">{v?.sku ?? '—'}</td>
                    <td className="px-5 py-3 text-slate-500">{v?.inventory ?? 0}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <StockDot status={v ? stockByVariant.get(v.id) : null} />
                        <button onClick={() => setMerchFor({ id: p.id, title: p.title })} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline" title="Images, options, specs, categories, bulk pricing">
                          <Sliders size={13} /> Merchandise
                        </button>
                      </div>
                    </td>
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
            <Field label="HSN/SAC code" hint="For the GST invoice">
              <Input value={form.hsnCode} onChange={(e) => setForm({ ...form, hsnCode: e.target.value })} placeholder="0910" />
            </Field>
            <Field label="GST rate (%)" hint="Blank = store default">
              <Input type="number" min="0" max="100" step="0.5" value={form.gstRate} onChange={(e) => setForm({ ...form, gstRate: e.target.value })} placeholder="18" />
            </Field>
            <Field label="Brand">
              <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Acme" />
            </Field>
            <Field label="Product type" hint="e.g. Ring, Serum, Sensor">
              <Input value={form.productType} onChange={(e) => setForm({ ...form, productType: e.target.value })} placeholder="T-Shirt" />
            </Field>
          </div>
          <p className="-mt-2 text-xs text-slate-400">After creating, use <strong>Merchandise</strong> on the product row to add images, options, specs, categories &amp; bulk pricing.</p>
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

      <MerchandiseModal
        open={Boolean(merchFor)}
        onClose={() => setMerchFor(null)}
        storeId={selectedId}
        productId={merchFor?.id}
        productTitle={merchFor?.title}
      />
    </div>
  );
}

function PriceCell({ variant, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String((variant.priceMinor / 100).toFixed(0)));
  const [compareAt, setCompareAt] = useState(variant.compareAtMinor ? String((variant.compareAtMinor / 100).toFixed(0)) : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    setBusy(true);
    setErr('');
    try {
      await api.products.updateVariant(variant.id, {
        priceMinor: Math.max(0, Math.round(Number(price) * 100)),
        compareAtMinor: compareAt ? Math.round(Number(compareAt) * 100) : null,
      });
      setEditing(false);
      onSaved?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="rounded px-1.5 py-0.5 font-medium text-slate-700 hover:bg-slate-100" title="Edit price">
        {formatMoney(variant.priceMinor, variant.currency)}
        {variant.compareAtMinor > variant.priceMinor && (
          <span className="ml-1.5 text-xs font-normal text-slate-400 line-through">{formatMoney(variant.compareAtMinor, variant.currency)}</span>
        )}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-slate-400">₹</span>
      <input autoFocus type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-sm" placeholder="price" />
      <input type="number" min={0} value={compareAt} onChange={(e) => setCompareAt(e.target.value)} className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-sm" placeholder="was" title="Compare-at (was) price — optional" />
      <button onClick={save} disabled={busy} className="rounded bg-indigo-600 px-1.5 py-0.5 text-xs font-medium text-white">Save</button>
      <button onClick={() => setEditing(false)} className="text-xs text-slate-400">✕</button>
      {err && <span className="text-xs text-rose-600">{err}</span>}
    </div>
  );
}
