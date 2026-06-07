import { useEffect, useState } from 'react';
import { Trash2, Star } from 'lucide-react';
import { api } from '../api/client';
import { Modal, Button, Field, Input, Select } from './ui';

const TABS = ['Images', 'Options', 'Specs', 'Categories', 'Bulk pricing'];

export default function MerchandiseModal({ open, onClose, storeId, productId, productTitle }) {
  const [tab, setTab] = useState('Images');
  return (
    <Modal open={open} onClose={onClose} title={`Merchandise · ${productTitle ?? ''}`}>
      <div className="mb-4 flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === t ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>{t}</button>
        ))}
      </div>
      {open && tab === 'Images' && <Images storeId={storeId} productId={productId} />}
      {open && tab === 'Options' && <Options productId={productId} />}
      {open && tab === 'Specs' && <Specs productId={productId} />}
      {open && tab === 'Categories' && <Categories storeId={storeId} productId={productId} />}
      {open && tab === 'Bulk pricing' && <Pricing productId={productId} />}
    </Modal>
  );
}

function Images({ storeId, productId }) {
  const [imgs, setImgs] = useState([]);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api.catalog.listImages(productId).then(setImgs).catch(() => setImgs([]));
  useEffect(() => { load(); }, [productId]);
  async function add() {
    if (!url.trim()) return;
    setBusy(true);
    try { await api.catalog.addImage({ storeId, productId, url: url.trim() }); setUrl(''); load(); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://image-url.jpg" />
        <Button onClick={add} loading={busy} disabled={!url.trim()}>Add</Button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {imgs.map((im) => (
          <div key={im.id} className="rounded-lg border border-slate-200 p-2">
            <img src={im.url} alt={im.alt ?? ''} className="mb-2 h-20 w-full rounded object-cover bg-slate-100" onError={(e) => { e.target.style.visibility = 'hidden'; }} />
            <div className="flex items-center justify-between">
              <button onClick={() => api.catalog.setPrimaryImage(im.id).then(load)} className={`text-xs ${im.isPrimary ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500'}`} title="Make primary"><Star size={14} fill={im.isPrimary ? 'currentColor' : 'none'} /></button>
              <button onClick={() => api.catalog.removeImage(im.id).then(load)} className="text-slate-400 hover:text-rose-600"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
      {!imgs.length && <p className="text-xs text-slate-400">No images yet. The first image you add becomes the primary.</p>}
    </div>
  );
}

function Options({ productId }) {
  const [rows, setRows] = useState([{ name: '', values: '' }]);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api.catalog.getOptions(productId).then((opts) => {
      setRows(opts.length ? opts.map((o) => ({ name: o.name, values: o.values.map((v) => v.value).join(', ') })) : [{ name: '', values: '' }]);
    }).catch(() => undefined);
  }, [productId]);
  const set = (i, k, v) => { const next = [...rows]; next[i] = { ...next[i], [k]: v }; setRows(next); setSaved(false); };
  async function save() {
    const options = rows.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), values: r.values.split(',').map((s) => s.trim()).filter(Boolean) }));
    await api.catalog.setOptions(productId, options); setSaved(true);
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Define option axes (e.g. Size, Colour). Then set each variant's option map via the variant editor / API.</p>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-2 gap-2">
          <Input value={r.name} onChange={(e) => set(i, 'name', e.target.value)} placeholder="Size" />
          <Input value={r.values} onChange={(e) => set(i, 'values', e.target.value)} placeholder="S, M, L" />
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => setRows([...rows, { name: '', values: '' }])}>+ Option</Button>
        <Button onClick={save}>Save</Button>
        {saved && <span className="text-sm text-emerald-600">Saved.</span>}
      </div>
    </div>
  );
}

function Specs({ productId }) {
  const [rows, setRows] = useState([{ name: '', value: '', unit: '', filterable: false }]);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api.catalog.getAttributes(productId).then((a) => setRows(a.length ? a.map((x) => ({ name: x.name, value: x.value, unit: x.unit ?? '', filterable: x.filterable })) : [{ name: '', value: '', unit: '', filterable: false }])).catch(() => undefined);
  }, [productId]);
  const set = (i, k, v) => { const next = [...rows]; next[i] = { ...next[i], [k]: v }; setRows(next); setSaved(false); };
  async function save() {
    const attributes = rows.filter((r) => r.name.trim() && r.value.trim()).map((r) => ({ name: r.name.trim(), value: r.value.trim(), unit: r.unit || undefined, filterable: r.filterable }));
    await api.catalog.setAttributes(productId, attributes); setSaved(true);
  }
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-12 items-center gap-2">
          <div className="col-span-4"><Input value={r.name} onChange={(e) => set(i, 'name', e.target.value)} placeholder="Material" /></div>
          <div className="col-span-4"><Input value={r.value} onChange={(e) => set(i, 'value', e.target.value)} placeholder="18k Gold" /></div>
          <div className="col-span-2"><Input value={r.unit} onChange={(e) => set(i, 'unit', e.target.value)} placeholder="unit" /></div>
          <label className="col-span-2 flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={r.filterable} onChange={(e) => set(i, 'filterable', e.target.checked)} /> filter</label>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => setRows([...rows, { name: '', value: '', unit: '', filterable: false }])}>+ Spec</Button>
        <Button onClick={save}>Save</Button>
        {saved && <span className="text-sm text-emerald-600">Saved.</span>}
      </div>
    </div>
  );
}

function Categories({ storeId, productId }) {
  const [collections, setCollections] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [title, setTitle] = useState('');
  const [saved, setSaved] = useState(false);
  const load = () => Promise.all([api.catalog.collections(storeId), api.products.get(productId)]).then(([cols, p]) => {
    setCollections(cols);
    setSelected(new Set((p.collections ?? []).map((c) => c.collection.id)));
  }).catch(() => undefined);
  useEffect(() => { load(); }, [productId]);
  const toggle = (id) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n); setSaved(false); };
  async function create() { if (!title.trim()) return; await api.catalog.createCollection({ storeId, title: title.trim() }); setTitle(''); load(); }
  async function save() { await api.catalog.setProductCollections(productId, [...selected]); setSaved(true); }
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {collections.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} /> {c.title} <span className="text-xs text-slate-400">({c.productCount})</span>
          </label>
        ))}
        {!collections.length && <p className="text-xs text-slate-400">No collections yet.</p>}
      </div>
      <div className="flex gap-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New category name" />
        <Button variant="secondary" onClick={create} disabled={!title.trim()}>Create</Button>
      </div>
      <div className="flex items-center gap-2"><Button onClick={save}>Save assignment</Button>{saved && <span className="text-sm text-emerald-600">Saved.</span>}</div>
    </div>
  );
}

function Pricing({ productId }) {
  const [variants, setVariants] = useState([]);
  const [variantId, setVariantId] = useState('');
  const [rows, setRows] = useState([]);
  const [saved, setSaved] = useState(false);
  useEffect(() => { api.products.get(productId).then((p) => { setVariants(p.variants ?? []); if (p.variants?.[0]) setVariantId(p.variants[0].id); }).catch(() => undefined); }, [productId]);
  useEffect(() => { if (variantId) api.catalog.getTiers(variantId).then((t) => setRows(t.map((x) => ({ minQuantity: x.minQuantity, rupees: (x.priceMinor / 100).toString() })))).catch(() => undefined); }, [variantId]);
  const set = (i, k, v) => { const next = [...rows]; next[i] = { ...next[i], [k]: v }; setRows(next); setSaved(false); };
  async function save() {
    const tiers = rows.filter((r) => r.minQuantity > 1 && r.rupees).map((r) => ({ minQuantity: Number(r.minQuantity), priceMinor: Math.round(parseFloat(r.rupees) * 100) }));
    await api.catalog.setTiers(variantId, tiers); setSaved(true);
  }
  return (
    <div className="space-y-3">
      <Field label="Variant">
        <Select value={variantId} onChange={(e) => setVariantId(e.target.value)}>
          {variants.map((v) => <option key={v.id} value={v.id}>{v.title}{v.sku ? ` · ${v.sku}` : ''}</option>)}
        </Select>
      </Field>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-2 gap-2">
          <Input type="number" min="2" value={r.minQuantity} onChange={(e) => set(i, 'minQuantity', e.target.value)} placeholder="Min qty (e.g. 10)" />
          <Input type="number" min="0" step="0.01" value={r.rupees} onChange={(e) => set(i, 'rupees', e.target.value)} placeholder="Unit price ₹" />
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => setRows([...rows, { minQuantity: '', rupees: '' }])}>+ Tier</Button>
        <Button onClick={save} disabled={!variantId}>Save</Button>
        {saved && <span className="text-sm text-emerald-600">Saved.</span>}
      </div>
    </div>
  );
}
