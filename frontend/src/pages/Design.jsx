import { useState } from 'react';
import { Palette, Plus, Trash2, ArrowUp, ArrowDown, Eye, EyeOff, FileText } from 'lucide-react';
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
  Spinner,
  ErrorBanner,
  Badge,
  EmptyState,
} from '../components/ui';

const SECTION_LABELS = {
  hero: 'Hero banner',
  rich_text: 'Text block',
  image: 'Image',
  product_grid: 'Product grid',
  featured_product: 'Featured product',
  faq: 'FAQ',
};

// Default field values when a new section is added.
function defaultData(type) {
  switch (type) {
    case 'hero':
      return { heading: 'Welcome', subheading: '', ctaLabel: 'Shop now', ctaHref: '/', imageUrl: '' };
    case 'rich_text':
      return { title: '', body: '' };
    case 'image':
      return { imageUrl: '', alt: '', href: '' };
    case 'product_grid':
      return { title: 'Featured products', mode: 'all', productIds: [], limit: 6 };
    case 'featured_product':
      return { productId: '' };
    case 'faq':
      return { title: 'FAQ', items: [{ q: '', a: '' }] };
    default:
      return {};
  }
}

function uid() {
  return `sec_${Math.random().toString(36).slice(2, 10)}`;
}

// ---- Per-type field editors ------------------------------------------------
function SectionFields({ section, products, onChange }) {
  const d = section.data;
  const set = (patch) => onChange({ ...section, data: { ...d, ...patch } });

  if (section.type === 'hero') {
    return (
      <div className="space-y-2">
        <Input value={d.heading ?? ''} onChange={(e) => set({ heading: e.target.value })} placeholder="Heading" />
        <Input value={d.subheading ?? ''} onChange={(e) => set({ subheading: e.target.value })} placeholder="Subheading" />
        <div className="grid grid-cols-2 gap-2">
          <Input value={d.ctaLabel ?? ''} onChange={(e) => set({ ctaLabel: e.target.value })} placeholder="Button label" />
          <Input value={d.ctaHref ?? ''} onChange={(e) => set({ ctaHref: e.target.value })} placeholder="Button link (/, /product/…)" />
        </div>
      </div>
    );
  }
  if (section.type === 'rich_text') {
    return (
      <div className="space-y-2">
        <Input value={d.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder="Title (optional)" />
        <Textarea value={d.body ?? ''} onChange={(e) => set({ body: e.target.value })} placeholder="Body text" />
      </div>
    );
  }
  if (section.type === 'image') {
    return (
      <div className="space-y-2">
        <Input value={d.imageUrl ?? ''} onChange={(e) => set({ imageUrl: e.target.value })} placeholder="Image URL" />
        <Input value={d.alt ?? ''} onChange={(e) => set({ alt: e.target.value })} placeholder="Alt text" />
      </div>
    );
  }
  if (section.type === 'product_grid') {
    return (
      <div className="space-y-2">
        <Input value={d.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder="Section title" />
        <div className="grid grid-cols-2 gap-2">
          <Select value={d.mode ?? 'all'} onChange={(e) => set({ mode: e.target.value })}>
            <option value="all">All products</option>
            <option value="manual">Pick products</option>
          </Select>
          <Input type="number" min="1" value={d.limit ?? 6} onChange={(e) => set({ limit: parseInt(e.target.value, 10) || undefined })} placeholder="Max" />
        </div>
        {d.mode === 'manual' && (
          <div className="max-h-40 space-y-1 overflow-auto rounded-lg border border-slate-200 p-2">
            {(products ?? []).map((p) => {
              const ids = d.productIds ?? [];
              const checked = ids.includes(p.id);
              return (
                <label key={p.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-slate-50">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-indigo-600"
                    checked={checked}
                    onChange={() => set({ productIds: checked ? ids.filter((x) => x !== p.id) : [...ids, p.id] })}
                  />
                  {p.title}
                </label>
              );
            })}
          </div>
        )}
      </div>
    );
  }
  if (section.type === 'featured_product') {
    return (
      <Select value={d.productId ?? ''} onChange={(e) => set({ productId: e.target.value })}>
        <option value="">Select a product…</option>
        {(products ?? []).map((p) => (
          <option key={p.id} value={p.id}>{p.title}</option>
        ))}
      </Select>
    );
  }
  if (section.type === 'faq') {
    const items = d.items ?? [];
    const setItem = (i, patch) => set({ items: items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) });
    return (
      <div className="space-y-2">
        <Input value={d.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder="Section title" />
        {items.map((it, i) => (
          <div key={i} className="space-y-1 rounded-lg border border-slate-200 p-2">
            <Input value={it.q ?? ''} onChange={(e) => setItem(i, { q: e.target.value })} placeholder="Question" />
            <Textarea value={it.a ?? ''} onChange={(e) => setItem(i, { a: e.target.value })} placeholder="Answer" />
            <button type="button" onClick={() => set({ items: items.filter((_, idx) => idx !== i) })} className="text-xs text-rose-600">
              Remove
            </button>
          </div>
        ))}
        <button type="button" onClick={() => set({ items: [...items, { q: '', a: '' }] })} className="text-xs font-medium text-indigo-600">
          + Add question
        </button>
      </div>
    );
  }
  return null;
}

// ---- Page editor -----------------------------------------------------------
function PageEditor({ page, products, onSaved, onDeleted }) {
  // Mounted fresh per page (parent keys this component by page.id).
  const [form, setForm] = useState(page);
  const [addType, setAddType] = useState('hero');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const sections = form.sections ?? [];
  const setSection = (i, next) => setForm({ ...form, sections: sections.map((s, idx) => (idx === i ? next : s)) });
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[i], next[j]] = [next[j], next[i]];
    setForm({ ...form, sections: next });
  };
  const addSection = () => setForm({ ...form, sections: [...sections, { id: uid(), type: addType, data: defaultData(addType) }] });
  const removeSection = (i) => setForm({ ...form, sections: sections.filter((_, idx) => idx !== i) });

  async function save() {
    setSaving(true);
    setError('');
    try {
      const saved = await api.design.updatePage(form.id, {
        title: form.title,
        slug: form.slug,
        sections: form.sections,
        metaTitle: form.metaTitle || undefined,
        metaDescription: form.metaDescription || undefined,
      });
      onSaved(saved);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish() {
    const next = form.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    const saved = await api.design.setPageStatus(form.id, next);
    setForm({ ...form, status: saved.status });
    onSaved(saved);
  }

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {form.title} <Badge>{form.status}</Badge>
          </span>
        }
        subtitle={`/${form.slug}`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={togglePublish}>
              {form.status === 'PUBLISHED' ? <><EyeOff size={14} /> Unpublish</> : <><Eye size={14} /> Publish</>}
            </Button>
            <Button onClick={save} loading={saving}>Save</Button>
          </div>
        }
      />
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Slug" hint='"home" is the landing page.'>
            <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SEO title"><Input value={form.metaTitle ?? ''} onChange={(e) => setForm({ ...form, metaTitle: e.target.value })} /></Field>
          <Field label="SEO description"><Input value={form.metaDescription ?? ''} onChange={(e) => setForm({ ...form, metaDescription: e.target.value })} /></Field>
        </div>

        <div className="space-y-3">
          {sections.map((s, i) => (
            <div key={s.id} className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">{SECTION_LABELS[s.type] ?? s.type}</span>
                <div className="flex gap-1">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded border border-slate-200 p-1 text-slate-500 disabled:opacity-30"><ArrowUp size={13} /></button>
                  <button onClick={() => move(i, 1)} disabled={i === sections.length - 1} className="rounded border border-slate-200 p-1 text-slate-500 disabled:opacity-30"><ArrowDown size={13} /></button>
                  <button onClick={() => removeSection(i)} className="rounded border border-slate-200 p-1 text-rose-600"><Trash2 size={13} /></button>
                </div>
              </div>
              <SectionFields section={s} products={products} onChange={(next) => setSection(i, next)} />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
          <Select value={addType} onChange={(e) => setAddType(e.target.value)} className="max-w-xs">
            {Object.entries(SECTION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Button variant="secondary" onClick={addSection}><Plus size={14} /> Add section</Button>
          <div className="flex-1" />
          <button onClick={() => onDeleted(form)} className="text-xs text-rose-600 hover:underline">Delete page</button>
        </div>

        {error && <ErrorBanner message={error} />}
      </div>
    </Card>
  );
}

// ---- Theme -----------------------------------------------------------------
function ThemeCard({ storeId }) {
  const { data } = useAsync(() => api.design.getTheme(storeId), [storeId]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const t = form ?? (data ? { primaryColor: data.primaryColor, accentColor: data.accentColor, logoText: data.logoText ?? '' } : null);

  async function save() {
    setSaving(true);
    try {
      await api.design.setTheme({ storeId, ...t, logoText: t.logoText || undefined });
    } finally {
      setSaving(false);
    }
  }
  if (!t) return null;
  return (
    <Card>
      <CardHeader title="Theme" subtitle="Colors and logo applied across the storefront." />
      <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3">
        <Field label="Brand color">
          <div className="flex items-center gap-2">
            <input type="color" value={t.primaryColor} onChange={(e) => setForm({ ...t, primaryColor: e.target.value })} className="h-9 w-12 rounded border border-slate-200" />
            <Input value={t.primaryColor} onChange={(e) => setForm({ ...t, primaryColor: e.target.value })} />
          </div>
        </Field>
        <Field label="Accent color">
          <div className="flex items-center gap-2">
            <input type="color" value={t.accentColor} onChange={(e) => setForm({ ...t, accentColor: e.target.value })} className="h-9 w-12 rounded border border-slate-200" />
            <Input value={t.accentColor} onChange={(e) => setForm({ ...t, accentColor: e.target.value })} />
          </div>
        </Field>
        <Field label="Logo text" hint="Shown in the storefront header.">
          <Input value={t.logoText} onChange={(e) => setForm({ ...t, logoText: e.target.value })} placeholder="Store name" />
        </Field>
      </div>
      <div className="flex justify-end px-5 pb-5">
        <Button onClick={save} loading={saving}>Save theme</Button>
      </div>
    </Card>
  );
}

const TEMPLATE_CATEGORIES = ['', 'fashion', 'lifestyle', 'cosmetics', 'jewellery'];

// Ready-made store designs (theme + storefront layout) by vertical.
function TemplatesCard({ storeId, onApplied }) {
  const [category, setCategory] = useState('');
  const [applying, setApplying] = useState(null);
  const { data: templates, loading } = useAsync(() => api.design.templates(category || undefined), [category]);

  async function apply(t) {
    setApplying(t.id);
    try {
      await api.design.applyTemplate({ storeId, templateId: t.id });
      onApplied?.();
    } finally {
      setApplying(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Start from a template"
        subtitle="Apply a ready-made theme + storefront layout (your products fill the grid)."
        action={
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs capitalize">
            {TEMPLATE_CATEGORIES.map((c) => <option key={c} value={c}>{c || 'All categories'}</option>)}
          </select>
        }
      />
      {loading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {templates?.map((t) => (
            <div key={t.id} className="flex flex-col rounded-xl border border-slate-200 p-3">
              <div className="flex h-14 overflow-hidden rounded-lg">
                <div className="flex-1" style={{ background: t.theme.primaryColor }} />
                <div className="w-1/3" style={{ background: t.theme.accentColor }} />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-sm font-medium text-slate-900">{t.name}</span>
                <Badge>{t.category}</Badge>
              </div>
              <p className="mt-0.5 flex-1 text-xs text-slate-500">{t.description}</p>
              <Button variant="secondary" className="mt-2" loading={applying === t.id} onClick={() => apply(t)}>
                Apply template
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function Design() {
  const { selectedId, selectedStore } = useStores();
  const [selected, setSelected] = useState(null);
  const { data: pages, loading, error, reload } = useAsync(
    () => (selectedId ? api.design.listPages(selectedId) : Promise.resolve([])),
    [selectedId],
  );
  const { data: products } = useAsync(
    () => (selectedId ? api.products.list(selectedId) : Promise.resolve([])),
    [selectedId],
  );
  const [creating, setCreating] = useState(false);

  async function createPage() {
    setCreating(true);
    try {
      const slug = pages?.some((p) => p.slug === 'home') ? `page-${Date.now().toString(36)}` : 'home';
      const page = await api.design.createPage({ storeId: selectedId, slug, title: slug === 'home' ? 'Home' : 'New page' });
      await reload();
      setSelected(page);
    } finally {
      setCreating(false);
    }
  }

  if (!selectedId) {
    return (
      <Card>
        <EmptyState icon={Palette} title="Select a store">Choose a store to design its storefront.</EmptyState>
      </Card>
    );
  }

  const current = selected && pages?.find((p) => p.id === selected.id) ? selected : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Design</h1>
        <Button onClick={createPage} loading={creating}><Plus size={15} /> New page</Button>
      </div>

      <TemplatesCard storeId={selectedId} onApplied={reload} />

      <ThemeCard storeId={selectedId} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Pages" subtitle={selectedStore?.name} />
          {loading ? (
            <Spinner />
          ) : error ? (
            <div className="p-5"><ErrorBanner message={error} /></div>
          ) : pages?.length === 0 ? (
            <EmptyState icon={FileText} title="No pages yet">Create a page to design your storefront.</EmptyState>
          ) : (
            <div className="divide-y divide-slate-50">
              {pages?.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelected(p)}
                  className={`block w-full px-5 py-3 text-left hover:bg-slate-50 ${current?.id === p.id ? 'bg-indigo-50' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-900">{p.title}</span>
                    <Badge>{p.status}</Badge>
                  </div>
                  <div className="text-xs text-slate-400">/{p.slug}</div>
                </button>
              ))}
            </div>
          )}
        </Card>

        <div className="lg:col-span-2">
          {current ? (
            <PageEditor
              key={current.id}
              page={current}
              products={products}
              onSaved={(saved) => { setSelected(saved); reload(); }}
              onDeleted={async (p) => { await api.design.removePage(p.id); setSelected(null); reload(); }}
            />
          ) : (
            <Card>
              <EmptyState icon={Palette} title="Select a page">Pick a page on the left to edit its sections.</EmptyState>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
