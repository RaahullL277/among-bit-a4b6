import { useState } from 'react';
import { Image as ImageIcon, Zap, Trash2, Wand2 } from 'lucide-react';
import { api } from '../api/client';
import { useStores } from '../context/StoreContext';
import { useAsync } from '../hooks/useAsync';
import { Button, Card, CardHeader, Spinner, ErrorBanner, Badge, EmptyState } from '../components/ui';

function kb(bytes) {
  if (!bytes) return '0 KB';
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.round(bytes / 1000)} KB`;
}

export default function Images() {
  const { selectedId, selectedStore } = useStores();
  const [busy, setBusy] = useState('');
  const { data: images, loading, error, reload } = useAsync(
    () => (selectedId ? api.images.list(selectedId) : Promise.resolve([])),
    [selectedId],
  );
  const { data: savings, reload: reloadSavings } = useAsync(
    () => (selectedId ? api.images.savings(selectedId) : Promise.resolve(null)),
    [selectedId],
  );

  async function optimizeAll() {
    setBusy('all');
    try { await api.images.optimizeAll(selectedId); reload(); reloadSavings(); } finally { setBusy(''); }
  }
  async function optimizeOne(id) {
    setBusy(id);
    try { await api.images.optimize(id); reload(); reloadSavings(); } finally { setBusy(''); }
  }
  async function genAlt(id) {
    setBusy(id + 'alt');
    try { await api.images.setAlt(id, { generate: true }); reload(); reloadSavings(); } finally { setBusy(''); }
  }
  async function remove(id) {
    setBusy(id + 'del');
    try { await api.images.remove(id); reload(); reloadSavings(); } finally { setBusy(''); }
  }

  if (!selectedId) {
    return <Card><EmptyState icon={ImageIcon} title="Select a store">Choose a store to manage its images.</EmptyState></Card>;
  }
  if (loading) return <Spinner />;
  if (error) return <Card><div className="p-5"><ErrorBanner message={error} /></div></Card>;

  const list = images ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Images &amp; media</h1>
          <p className="text-sm text-slate-500">Compress product images for page speed and SEO, and keep alt text complete.</p>
        </div>
        <Button onClick={optimizeAll} loading={busy === 'all'} disabled={!savings?.pending}><Zap size={14} /> Optimize all</Button>
      </div>

      {savings && (
        <Card>
          <div className="flex flex-wrap items-center gap-x-10 gap-y-3 px-5 py-4">
            <Stat label="Images" value={savings.total} />
            <Stat label="Optimized" value={`${savings.optimized}/${savings.total}`} />
            <Stat label="Saved" value={kb(savings.savedBytes)} highlight />
            <Stat label="Missing alt text" value={savings.missingAlt} warn={savings.missingAlt > 0} />
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Image assets" subtitle={selectedStore?.name} />
        {list.length === 0 ? (
          <EmptyState icon={ImageIcon} title="No images yet">Images are added when you import products with media.</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2">Image</th><th className="px-5 py-2">Product</th>
                <th className="px-5 py-2">State</th><th className="px-5 py-2">Size</th><th className="px-5 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((img) => (
                <tr key={img.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-2">
                    <div className="flex items-center gap-2">
                      <img src={img.url} alt={img.alt ?? ''} className="h-9 w-9 rounded object-cover bg-slate-100" onError={(e) => { e.target.style.visibility = 'hidden'; }} />
                      <span className={`text-xs ${img.alt ? 'text-slate-500' : 'text-amber-600'}`}>{img.alt || 'no alt text'}</span>
                    </div>
                  </td>
                  <td className="px-5 py-2 text-slate-600">{img.product?.title ?? '—'}</td>
                  <td className="px-5 py-2">{img.optimized ? <Badge>Optimized</Badge> : <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Pending</span>}</td>
                  <td className="px-5 py-2 text-slate-500">{kb(img.optimized && img.optimizedBytes ? img.optimizedBytes : img.originalBytes)}</td>
                  <td className="px-5 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {!img.optimized && <button onClick={() => optimizeOne(img.id)} disabled={busy === img.id} title="Optimize" className="rounded p-1.5 text-indigo-600 hover:bg-indigo-50"><Zap size={15} /></button>}
                      {!img.alt && <button onClick={() => genAlt(img.id)} disabled={busy === img.id + 'alt'} title="Generate alt text" className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><Wand2 size={15} /></button>}
                      <button onClick={() => remove(img.id)} disabled={busy === img.id + 'del'} title="Delete" className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, highlight, warn }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-lg font-semibold ${highlight ? 'text-emerald-600' : warn ? 'text-amber-600' : 'text-slate-900'}`}>{value}</div>
    </div>
  );
}
