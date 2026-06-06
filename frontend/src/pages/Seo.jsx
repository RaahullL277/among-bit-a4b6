import { useState } from 'react';
import { Search, Gauge, Image as ImageIcon, Wand2, Sparkles, Trash2, Plus } from 'lucide-react';
import { api } from '../api/client';
import { useStores } from '../context/StoreContext';
import { useAsync } from '../hooks/useAsync';
import { Button, Card, CardHeader, Field, Input, Spinner, ErrorBanner, Badge, EmptyState } from '../components/ui';

function kb(bytes) {
  if (!bytes) return '0 KB';
  return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function ScoreRing({ score, label, icon: Icon }) {
  const color = score >= 80 ? 'text-emerald-600' : score >= 50 ? 'text-amber-600' : 'text-rose-600';
  return (
    <div className="flex items-center gap-3">
      <div className={`flex h-14 w-14 items-center justify-center rounded-full border-4 ${score >= 80 ? 'border-emerald-200' : score >= 50 ? 'border-amber-200' : 'border-rose-200'}`}>
        <span className={`text-lg font-bold ${color}`}>{score}</span>
      </div>
      <div>
        <div className="flex items-center gap-1 text-sm font-medium text-slate-900"><Icon size={14} /> {label}</div>
        <div className="text-xs text-slate-400">out of 100</div>
      </div>
    </div>
  );
}

function SettingsCard({ storeId }) {
  const { data, reload } = useAsync(() => api.seo.getSettings(storeId), [storeId]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const s = form ?? (data ? { titleTemplate: data.titleTemplate, defaultDescription: data.defaultDescription ?? '', indexable: data.indexable } : null);
  async function save() {
    setSaving(true);
    try {
      await api.seo.setSettings({ storeId, ...s, defaultDescription: s.defaultDescription || undefined });
      reload();
    } finally {
      setSaving(false);
    }
  }
  if (!s) return null;
  return (
    <Card>
      <CardHeader title="SEO settings" subtitle="Defaults applied across the storefront." />
      <div className="space-y-4 p-5">
        <Field label="Title template" hint="Use {title} and {storeName}.">
          <Input value={s.titleTemplate} onChange={(e) => setForm({ ...s, titleTemplate: e.target.value })} />
        </Field>
        <Field label="Default meta description">
          <Input value={s.defaultDescription} onChange={(e) => setForm({ ...s, defaultDescription: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={s.indexable} onChange={(e) => setForm({ ...s, indexable: e.target.checked })} />
          Allow search engines to index this store
        </label>
        <div className="flex justify-end"><Button onClick={save} loading={saving}>Save</Button></div>
      </div>
    </Card>
  );
}

function AuditCard({ storeId }) {
  const { data, loading, error } = useAsync(() => api.seo.audit(storeId), [storeId]);
  if (loading) return <Card><Spinner /></Card>;
  if (error) return <Card><div className="p-5"><ErrorBanner message={error} /></div></Card>;
  if (!data) return null;
  return (
    <Card>
      <CardHeader title="SEO audit" subtitle={`${data.counts.products} products · ${data.counts.pages} pages · ${data.counts.images} images`} />
      <div className="flex flex-wrap gap-8 px-5 py-4">
        <ScoreRing score={data.score} label="SEO health" icon={Search} />
        <ScoreRing score={data.performance.speedScore} label="Page speed" icon={Gauge} />
        <div className="text-sm text-slate-500">
          <div>{data.counts.errors} errors · {data.counts.warnings} warnings</div>
          <div>{data.performance.unoptimized} unoptimized images · ~{kb(data.performance.estimatedSavingsBytes)} recoverable</div>
        </div>
      </div>
      {data.issues.length > 0 && (
        <div className="max-h-72 divide-y divide-slate-50 overflow-auto border-t border-slate-100">
          {data.issues.map((i, idx) => (
            <div key={idx} className="flex items-start gap-2 px-5 py-2.5 text-sm">
              <span className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${i.severity === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{i.severity}</span>
              <div>
                <span className="text-slate-700">{i.message}</span>
                <span className="ml-1 text-xs text-slate-400">— {i.entityTitle}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ImagesCard({ storeId }) {
  const { data: images, loading, reload } = useAsync(() => api.images.list(storeId), [storeId]);
  const { data: savings, reload: reloadSavings } = useAsync(() => api.images.savings(storeId), [storeId]);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const [bytes, setBytes] = useState('');

  async function act(fn) {
    setBusy(true);
    try { await fn(); reload(); reloadSavings(); } finally { setBusy(false); }
  }
  async function add() {
    if (!url || !bytes) return;
    await act(() => api.images.create({ storeId, url, originalBytes: Number(bytes) }));
    setUrl(''); setBytes('');
  }

  return (
    <Card>
      <CardHeader
        title="Image optimization"
        subtitle={savings ? `${savings.optimized}/${savings.total} optimized · ${kb(savings.savedBytes)} saved · ${savings.missingAlt} missing alt` : 'Compress images & add alt text'}
        action={<Button disabled={busy} onClick={() => act(() => api.images.optimizeAll(storeId))}><Wand2 size={14} /> Optimize all</Button>}
      />
      <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 px-5 py-3">
        <Field label="Image URL"><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/photo.jpg" /></Field>
        <Field label="Size (bytes)"><Input type="number" value={bytes} onChange={(e) => setBytes(e.target.value)} placeholder="300000" className="w-32" /></Field>
        <Button variant="secondary" disabled={busy || !url || !bytes} onClick={add}><Plus size={14} /> Add</Button>
      </div>
      {loading ? (
        <Spinner />
      ) : images?.length === 0 ? (
        <EmptyState icon={ImageIcon} title="No images tracked">Add product image URLs to optimize them and manage alt text.</EmptyState>
      ) : (
        <div className="divide-y divide-slate-50">
          {images?.map((img) => (
            <div key={img.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <div className="min-w-0">
                <div className="truncate text-slate-700">{img.url}</div>
                <div className="text-xs text-slate-400">
                  {img.product?.title ? `${img.product.title} · ` : ''}
                  {kb(img.originalBytes)}{img.optimized ? ` → ${kb(img.optimizedBytes)}` : ''}
                  {' · '}{img.alt ? `alt: "${img.alt.slice(0, 30)}"` : 'no alt'}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {img.optimized ? <Badge>Optimized</Badge> : (
                  <button disabled={busy} onClick={() => act(() => api.images.optimize(img.id))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">Optimize</button>
                )}
                <button disabled={busy} onClick={() => act(() => api.images.setAlt(img.id, { generate: true }))} className="rounded-lg border border-slate-300 p-1.5 text-indigo-600" title="Generate alt text"><Sparkles size={13} /></button>
                <button disabled={busy} onClick={() => act(() => api.images.remove(img.id))} className="rounded-lg border border-slate-300 p-1.5 text-rose-600" title="Delete"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function Seo() {
  const { selectedId } = useStores();
  if (!selectedId) {
    return (
      <Card>
        <EmptyState icon={Search} title="Select a store">Choose a store to audit its SEO and images.</EmptyState>
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-slate-900">SEO &amp; speed</h1>
      <AuditCard storeId={selectedId} />
      <SettingsCard storeId={selectedId} />
      <ImagesCard storeId={selectedId} />
    </div>
  );
}
