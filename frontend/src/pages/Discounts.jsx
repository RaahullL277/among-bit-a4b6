import { useState } from 'react';
import { Tag, Plus, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { useStores } from '../context/StoreContext';
import { useAsync } from '../hooks/useAsync';
import {
  Card, CardHeader, Spinner, ErrorBanner, Badge, EmptyState, Button, Field, Input, Select, Modal, formatMoney,
} from '../components/ui';

const emptyForm = { code: '', type: 'PERCENT', value: '', minSpendRupees: '', maxRedemptions: '', expiresAt: '' };

export default function Discounts() {
  const { selectedId, selectedStore } = useStores();
  const { data, loading, error, reload } = useAsync(() => (selectedId ? api.discounts.list(selectedId) : Promise.resolve([])), [selectedId]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  if (!selectedId) {
    return <Card><EmptyState icon={Tag} title="Select a store">Choose a store to manage discount codes.</EmptyState></Card>;
  }

  async function create(e) {
    e.preventDefault();
    setErr(''); setSaving(true);
    try {
      await api.discounts.create({
        storeId: selectedId,
        code: form.code,
        type: form.type,
        value: form.type === 'PERCENT' ? Math.round(Number(form.value)) : Math.round(Number(form.value) * 100),
        minSpendMinor: form.minSpendRupees ? Math.round(Number(form.minSpendRupees) * 100) : 0,
        maxRedemptions: form.maxRedemptions ? Math.round(Number(form.maxRedemptions)) : null,
        expiresAt: form.expiresAt || undefined,
      });
      setOpen(false); setForm(emptyForm); reload();
    } catch (e2) { setErr(e2.message); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Discount codes</h1>
        <Button onClick={() => setOpen(true)}><Plus size={15} /> New code</Button>
      </div>

      <Card>
        <CardHeader title={selectedStore?.name} subtitle="Coupon codes shoppers enter at checkout" />
        {loading ? <Spinner /> : error ? <div className="p-5"><ErrorBanner message={error} /></div> : !data?.length ? (
          <EmptyState icon={Tag} title="No codes yet">Create a code like WELCOME10 to offer a discount.</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-5 py-3 font-medium">Code</th>
                <th className="px-5 py-3 font-medium">Discount</th>
                <th className="px-5 py-3 font-medium">Min spend</th>
                <th className="px-5 py-3 font-medium">Used</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-3 font-mono font-medium text-slate-900">{d.code}</td>
                  <td className="px-5 py-3 text-slate-700">{d.type === 'PERCENT' ? `${d.value}%` : formatMoney(d.value)}</td>
                  <td className="px-5 py-3 text-slate-500">{d.minSpendMinor ? formatMoney(d.minSpendMinor) : '—'}</td>
                  <td className="px-5 py-3 text-slate-500">{d.redeemedCount}{d.maxRedemptions ? ` / ${d.maxRedemptions}` : ''}</td>
                  <td className="px-5 py-3">
                    <button onClick={() => api.discounts.setActive(d.id, !d.active).then(reload)}>
                      <Badge>{d.active ? 'Active' : 'Off'}</Badge>
                    </button>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => api.discounts.remove(d.id).then(reload)} className="text-slate-400 hover:text-rose-600"><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="New discount code">
        <form onSubmit={create} className="space-y-4">
          <ErrorBanner message={err} />
          <Field label="Code"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="WELCOME10" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="PERCENT">Percent off</option>
                <option value="FIXED">Fixed ₹ off</option>
              </Select>
            </Field>
            <Field label={form.type === 'PERCENT' ? 'Percent (1–100)' : 'Amount (₹)'}>
              <Input type="number" min="0" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </Field>
            <Field label="Min spend (₹)" hint="Optional"><Input type="number" min="0" value={form.minSpendRupees} onChange={(e) => setForm({ ...form, minSpendRupees: e.target.value })} /></Field>
            <Field label="Max redemptions" hint="Blank = unlimited"><Input type="number" min="1" value={form.maxRedemptions} onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })} /></Field>
            <Field label="Expires" hint="Optional"><Input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving} disabled={!form.code.trim() || !form.value}>Create</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
