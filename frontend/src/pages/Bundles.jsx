import { useMemo, useState } from 'react';
import { Package, Plus, Trash2, Sparkles } from 'lucide-react';
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

// A flat list of {variantId, label, price} options across the store's products.
function variantOptions(products) {
  const out = [];
  for (const p of products ?? []) {
    for (const v of p.variants ?? []) {
      const label = v.title && v.title !== 'Default' ? `${p.title} — ${v.title}` : p.title;
      out.push({ variantId: v.id, label, priceMinor: v.priceMinor, currency: v.currency });
    }
  }
  return out;
}

function CreateBundle({ storeId, products, open, onClose, onCreated }) {
  const options = useMemo(() => variantOptions(products), [products]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState('PERCENT');
  const [discountValue, setDiscountValue] = useState(10);
  const [picked, setPicked] = useState({}); // variantId -> quantity
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function reset() {
    setTitle('');
    setDescription('');
    setDiscountType('PERCENT');
    setDiscountValue(10);
    setPicked({});
    setError('');
  }

  function toggle(variantId) {
    setPicked((cur) => {
      const next = { ...cur };
      if (next[variantId]) delete next[variantId];
      else next[variantId] = 1;
      return next;
    });
  }

  const items = Object.entries(picked).map(([variantId, quantity]) => ({ variantId, quantity }));
  const subtotal = items.reduce((s, it) => {
    const o = options.find((x) => x.variantId === it.variantId);
    return s + (o ? o.priceMinor * it.quantity : 0);
  }, 0);
  const currency = options[0]?.currency ?? 'INR';
  const discountMinor =
    discountType === 'PERCENT'
      ? Math.min(subtotal, Math.round((subtotal * Number(discountValue || 0)) / 100))
      : Math.min(subtotal, Math.round(Number(discountValue || 0)));

  async function save(e) {
    e.preventDefault();
    setError('');
    if (items.length < 2) {
      setError('Pick at least two products for a bundle.');
      return;
    }
    setSaving(true);
    try {
      await api.bundles.create({
        storeId,
        title,
        description: description || undefined,
        discountType,
        discountValue: Number(discountValue),
        items,
      });
      reset();
      onCreated();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New bundle">
      <form onSubmit={save} className="space-y-4">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Phone + Case" required />
        </Field>
        <Field label="Description" hint="Shown on the storefront widget.">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Save when you buy them together." />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Discount type">
            <Select value={discountType} onChange={(e) => setDiscountType(e.target.value)}>
              <option value="PERCENT">Percent off</option>
              <option value="FIXED">Fixed amount off</option>
            </Select>
          </Field>
          <Field label={discountType === 'PERCENT' ? 'Percent (0–100)' : 'Amount (in minor units)'}>
            <Input type="number" min="0" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
          </Field>
        </div>

        <Field label="Products in the bundle" hint="Select two or more; set quantities as needed.">
          <div className="max-h-52 space-y-1 overflow-auto rounded-lg border border-slate-200 p-2">
            {options.length === 0 ? (
              <div className="px-2 py-3 text-sm text-slate-400">This store has no product variants yet.</div>
            ) : (
              options.map((o) => (
                <div key={o.variantId} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-indigo-600"
                    checked={Boolean(picked[o.variantId])}
                    onChange={() => toggle(o.variantId)}
                  />
                  <span className="flex-1 text-sm text-slate-700">{o.label}</span>
                  <span className="text-xs text-slate-400">{formatMoney(o.priceMinor, o.currency)}</span>
                  {picked[o.variantId] && (
                    <input
                      type="number"
                      min="1"
                      value={picked[o.variantId]}
                      onChange={(e) =>
                        setPicked((cur) => ({ ...cur, [o.variantId]: Math.max(1, parseInt(e.target.value, 10) || 1) }))
                      }
                      className="w-14 rounded-md border border-slate-300 px-2 py-1 text-xs"
                    />
                  )}
                </div>
              ))
            )}
          </div>
        </Field>

        {items.length >= 2 && (
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <span className="line-through">{formatMoney(subtotal, currency)}</span>{' '}
            <span className="font-semibold text-slate-900">{formatMoney(subtotal - discountMinor, currency)}</span>
            <span className="ml-2 text-emerald-700">Save {formatMoney(discountMinor, currency)}</span>
          </div>
        )}

        {error && <ErrorBanner message={error} />}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Create bundle</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function Bundles() {
  const { selectedId, selectedStore } = useStores();
  const [open, setOpen] = useState(false);
  const { data: bundles, loading, error, reload } = useAsync(
    () => (selectedId ? api.bundles.list(selectedId) : Promise.resolve([])),
    [selectedId],
  );
  const { data: products } = useAsync(
    () => (selectedId ? api.products.list(selectedId) : Promise.resolve([])),
    [selectedId],
  );

  async function toggleActive(b) {
    await api.bundles.update(b.id, { active: !b.active });
    reload();
  }
  async function remove(b) {
    await api.bundles.remove(b.id);
    reload();
  }

  if (!selectedId) {
    return (
      <Card>
        <EmptyState icon={Package} title="Select a store">Choose a store to manage its bundles.</EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Bundles</h1>
        <Button onClick={() => setOpen(true)}>
          <Plus size={15} /> New bundle
        </Button>
      </div>

      <Card>
        <CardHeader
          title={selectedStore?.name}
          subtitle="“Buy together & save” — the discount auto-applies at checkout when the cart has all items."
        />
        {loading ? (
          <Spinner />
        ) : error ? (
          <div className="p-5"><ErrorBanner message={error} /></div>
        ) : bundles?.length === 0 ? (
          <EmptyState icon={Sparkles} title="No bundles yet">
            Create a bundle to offer a saving on products bought together.
          </EmptyState>
        ) : (
          <div className="divide-y divide-slate-50">
            {bundles?.map((b) => (
              <div key={b.id} className="flex items-start justify-between px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">{b.title}</span>
                    <Badge>{b.active ? 'Active' : 'Inactive'}</Badge>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      {b.discountType === 'PERCENT' ? `${b.discountValue}% off` : `${formatMoney(b.discountMinor, b.currency)} off`}
                    </span>
                  </div>
                  {b.description && <div className="mt-0.5 text-xs text-slate-500">{b.description}</div>}
                  <div className="mt-1 text-xs text-slate-400">
                    {b.items.map((i) => `${i.quantity > 1 ? `${i.quantity}× ` : ''}${i.productTitle}`).join(' + ')}
                  </div>
                  <div className="mt-1 text-sm">
                    <span className="text-slate-400 line-through">{formatMoney(b.subtotalMinor, b.currency)}</span>{' '}
                    <span className="font-semibold text-slate-900">{formatMoney(b.totalMinor, b.currency)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-slate-500">
                    <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={b.active} onChange={() => toggleActive(b)} />
                    Active
                  </label>
                  <button onClick={() => remove(b)} className="rounded-lg border border-slate-300 p-1.5 text-rose-600 hover:bg-rose-50" title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <CreateBundle storeId={selectedId} products={products} open={open} onClose={() => setOpen(false)} onCreated={reload} />
    </div>
  );
}
