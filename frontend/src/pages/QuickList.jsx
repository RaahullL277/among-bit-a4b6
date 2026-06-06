import { useState } from 'react';
import { Sparkles, Wand2, Camera, CheckCircle2, Settings2 } from 'lucide-react';
import { api } from '../api/client';
import { useStores } from '../context/StoreContext';
import { Button, Card, CardHeader, ErrorBanner, EmptyState, Field, Input, Textarea } from '../components/ui';

export default function QuickList() {
  const { selectedId } = useStores();
  const [imageUrl, setImageUrl] = useState('');
  const [hint, setHint] = useState('');
  const [draft, setDraft] = useState(null);
  const [form, setForm] = useState(null); // editable content + price/discount/stock
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [published, setPublished] = useState(null);

  if (!selectedId) {
    return <Card><EmptyState icon={Camera} title="Select a store">Choose a store to list a product.</EmptyState></Card>;
  }

  async function generate() {
    setBusy('draft'); setError(''); setPublished(null);
    try {
      const d = await api.listing.draft({ storeId: selectedId, imageUrl: imageUrl.trim(), hint: hint.trim() });
      setDraft(d);
      setForm({
        title: d.content.title,
        description: d.content.description,
        tags: (d.content.tags ?? []).join(', '),
        metaTitle: d.content.seoTitle,
        metaDescription: d.content.seoDescription,
        priceMinor: '',
        discountPercent: '',
        stock: d.suggested?.stock ?? 10,
        status: 'ACTIVE',
      });
    } catch (e) {
      setError(e.message);
    } finally { setBusy(''); }
  }

  async function publish() {
    setBusy('publish'); setError('');
    try {
      const res = await api.listing.publish({
        storeId: selectedId,
        imageUrl: draft.photo.enhancedUrl,
        title: form.title,
        description: form.description,
        metaTitle: form.metaTitle,
        metaDescription: form.metaDescription,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        alt: draft.photo.alt,
        priceMinor: Math.round(Number(form.priceMinor) * 100),
        discountPercent: form.discountPercent ? Number(form.discountPercent) : undefined,
        stock: Number(form.stock),
        status: form.status,
      });
      setPublished(res);
      setDraft(null); setForm(null); setImageUrl(''); setHint('');
    } catch (e) {
      setError(e.message);
    } finally { setBusy(''); }
  }

  const set = (k, v) => setForm({ ...form, [k]: v });
  const pays = form?.priceMinor ? Number(form.priceMinor) : 0;
  const was = pays && form?.discountPercent ? pays / (1 - Number(form.discountPercent) / 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Quick list</h1>
        <p className="text-sm text-slate-500">Snap a photo, let the listing agent write the copy &amp; enhance the image, then set price, discount &amp; stock — done.</p>
      </div>

      {error && <Card><div className="p-4"><ErrorBanner message={error} /></div></Card>}

      {published ? (
        <Card>
          <div className="flex items-center gap-3 p-6">
            <CheckCircle2 className="text-emerald-600" size={28} />
            <div>
              <div className="font-medium text-slate-900">Listed “{published.product.title}” ({published.product.status})</div>
              <div className="text-sm text-slate-500">
                ₹{(published.priceMinor / 100).toFixed(0)}{published.compareAtMinor ? ` (was ₹${(published.compareAtMinor / 100).toFixed(0)}, ${published.discountPercent}% off)` : ''} · photo enhanced
              </div>
            </div>
            <Button className="ml-auto" variant="secondary" onClick={() => setPublished(null)}>List another</Button>
          </div>
        </Card>
      ) : (
        <>
          {/* Step 1: photo + hint */}
          <Card>
            <CardHeader title="1 · The photo" subtitle="Paste a photo URL (or your phone capture) and a few words about it" />
            <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
              <Field label="Product photo URL">
                <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…/photo.jpg" />
              </Field>
              <Field label="Hint (optional)" hint="e.g. blue cotton kurta">
                <Input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="What is it?" />
              </Field>
            </div>
            <div className="flex items-center gap-3 border-t border-slate-100 px-5 py-3">
              <Button onClick={generate} loading={busy === 'draft'} disabled={!imageUrl.trim()}><Wand2 size={14} /> Generate listing</Button>
              <span className="text-xs text-slate-400">The agent enhances the photo and writes the copy.</span>
            </div>
          </Card>

          {/* Step 2: review + price */}
          {form && draft && (
            <Card>
              <CardHeader title="2 · Review &amp; price" subtitle="Edit the AI copy, then set price, discount &amp; stock" />
              <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <div className="mb-1 text-xs font-medium text-slate-500">Enhanced photo</div>
                    <img src={draft.photo.enhancedUrl} alt={draft.photo.alt ?? ''} className="h-40 w-40 rounded-lg border border-slate-200 object-cover bg-slate-50" onError={(e) => { e.target.style.visibility = 'hidden'; }} />
                    <div className="mt-1 text-xs text-slate-400">{(draft.photo.adjustments ?? []).join(' · ')}</div>
                  </div>
                  <Field label="Title"><Input value={form.title} onChange={(e) => set('title', e.target.value)} /></Field>
                  <Field label="Tags (comma-separated)"><Input value={form.tags} onChange={(e) => set('tags', e.target.value)} /></Field>
                </div>
                <div className="space-y-4">
                  <Field label="Description"><Textarea rows={5} value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
                  <Field label="SEO meta description"><Textarea rows={2} value={form.metaDescription} onChange={(e) => set('metaDescription', e.target.value)} /></Field>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 border-t border-slate-100 p-5 md:grid-cols-4">
                <Field label="Price ₹" hint="What customers pay"><Input type="number" min={0} value={form.priceMinor} onChange={(e) => set('priceMinor', e.target.value)} /></Field>
                <Field label="Discount %" hint="Shows a was-price"><Input type="number" min={0} max={99} value={form.discountPercent} onChange={(e) => set('discountPercent', e.target.value)} /></Field>
                <Field label="Stock"><Input type="number" min={0} value={form.stock} onChange={(e) => set('stock', e.target.value)} /></Field>
                <Field label="Status">
                  <select value={form.status} onChange={(e) => set('status', e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="ACTIVE">Active (live)</option>
                    <option value="DRAFT">Draft</option>
                  </select>
                </Field>
              </div>
              <div className="flex items-center gap-3 border-t border-slate-100 px-5 py-3">
                <Button onClick={publish} loading={busy === 'publish'} disabled={!form.title || !form.priceMinor}><Sparkles size={14} /> Publish product</Button>
                {was > 0 && <span className="text-sm text-slate-500">Customer pays ₹{pays.toFixed(0)} · was ₹{was.toFixed(0)}</span>}
              </div>
            </Card>
          )}
        </>
      )}

      <HarnessEditor storeId={selectedId} />
    </div>
  );
}

function HarnessEditor({ storeId }) {
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    const c = await api.listing.getConfig(storeId);
    setCfg(c); setForm(null);
  }
  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !cfg) load();
  }
  const p = form ?? cfg;
  const set = (k, v) => { setForm({ ...p, [k]: v }); setSaved(false); };
  async function save() {
    setBusy(true);
    try {
      await api.listing.setConfig({
        storeId,
        masterPrompt: p.masterPrompt || null,
        brandVoice: p.brandVoice,
        tone: p.tone,
        categoryHint: p.categoryHint,
        contentRules: (typeof p.contentRules === 'string' ? p.contentRules.split('\n') : p.contentRules).map((r) => r.trim()).filter(Boolean),
        descWords: Number(p.descWords),
        enhanceBackground: p.enhanceBackground,
        squareCrop: p.squareCrop,
        autoAltText: p.autoAltText,
      });
      setSaved(true); await load();
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <button onClick={toggle} className="flex w-full items-center justify-between px-5 py-4 text-left">
        <div className="flex items-center gap-2"><Settings2 size={15} className="text-slate-400" /><span className="text-sm font-semibold text-slate-900">Agent settings (harness)</span></div>
        <span className="text-xs text-indigo-600">{open ? 'Hide' : 'Customise'}</span>
      </button>
      {open && p && (
        <div className="space-y-5 border-t border-slate-100 p-5">
          <Field label="Master prompt" hint="Overrides the built-in. Tokens: {{storeName}} {{brandVoice}} {{tone}} {{descWords}} {{rules}} {{photoPrefs}}">
            <Textarea rows={3} value={p.masterPrompt ?? ''} placeholder={p.defaultMasterPrompt} onChange={(e) => set('masterPrompt', e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Brand voice"><Input value={p.brandVoice ?? ''} onChange={(e) => set('brandVoice', e.target.value)} placeholder="premium and refined" /></Field>
            <Field label="Tone"><Input value={p.tone ?? ''} onChange={(e) => set('tone', e.target.value)} placeholder="concise" /></Field>
            <Field label="Default category"><Input value={p.categoryHint ?? ''} onChange={(e) => set('categoryHint', e.target.value)} placeholder="apparel" /></Field>
            <Field label="Description length (words)"><Input type="number" min={10} max={300} value={p.descWords} onChange={(e) => set('descWords', e.target.value)} /></Field>
            <Field label="Content rules (one per line)" hint="e.g. mention free shipping">
              <Textarea rows={2} value={Array.isArray(p.contentRules) ? p.contentRules.join('\n') : (p.contentRules ?? '')} onChange={(e) => set('contentRules', e.target.value)} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-4">
            <Check label="Clean background" on={p.enhanceBackground} onClick={() => set('enhanceBackground', !p.enhanceBackground)} />
            <Check label="Square crop" on={p.squareCrop} onClick={() => set('squareCrop', !p.squareCrop)} />
            <Check label="Auto alt text" on={p.autoAltText} onClick={() => set('autoAltText', !p.autoAltText)} />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={save} loading={busy} disabled={!form}>Save settings</Button>
            {saved && <span className="text-sm text-emerald-600">Saved.</span>}
          </div>
        </div>
      )}
    </Card>
  );
}

function Check({ label, on, onClick }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${on ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}>
      <span className={`h-3.5 w-3.5 rounded ${on ? 'bg-indigo-600' : 'bg-slate-300'}`} /> {label}
    </button>
  );
}
