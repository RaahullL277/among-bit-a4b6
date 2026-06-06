import { useState } from 'react';
import { ScrollText, Sparkles } from 'lucide-react';
import { api } from '../api/client';
import { useStores } from '../context/StoreContext';
import { useAsync } from '../hooks/useAsync';
import {
  Card,
  CardHeader,
  Spinner,
  ErrorBanner,
  Badge,
  EmptyState,
  Button,
  Field,
  Input,
  Textarea,
} from '../components/ui';

const TYPES = [
  ['TERMS', 'Terms of Use'],
  ['PRIVACY', 'Privacy Policy'],
  ['SHIPPING', 'Shipping & Delivery'],
  ['REFUND', 'Return, Refund & Cancellation'],
  ['COOKIES', 'Cookie Policy'],
];

export default function Legal() {
  const { selectedId, selectedStore } = useStores();
  const { data, loading, error, reload } = useAsync(() => (selectedId ? api.legal.list(selectedId) : Promise.resolve([])), [selectedId]);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null); // type currently open in the editor

  if (!selectedId) {
    return (
      <Card>
        <EmptyState icon={ScrollText} title="Select a store">
          Choose a store to manage its legal policies.
        </EmptyState>
      </Card>
    );
  }

  const byType = new Map((data ?? []).map((p) => [p.type, p]));

  async function generateAll(publish) {
    setBusy('all'); setNotice('');
    try {
      await api.legal.generate({ storeId: selectedId, publish });
      setNotice(publish ? 'Generated and published all policies.' : 'Generated all policies as drafts.');
      reload();
    } finally { setBusy(''); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Legal policies</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => generateAll(false)} loading={busy === 'all'}>
            <Sparkles size={14} className="mr-1 inline" /> Generate all (draft)
          </Button>
          <Button onClick={() => generateAll(true)} loading={busy === 'all'}>Generate &amp; publish all</Button>
        </div>
      </div>
      {notice && <p className="text-sm text-emerald-600">{notice}</p>}
      <p className="text-sm text-slate-500">
        India/GST-aware templates are generated from your seller tax identity (Invoicing) and return policy (Returns). Review each before publishing — they're starting points, not legal advice.
      </p>

      <Card>
        <CardHeader title={selectedStore?.name} subtitle="Terms, Privacy, Shipping, Refund & Cookies" />
        {loading ? (
          <Spinner />
        ) : error ? (
          <div className="p-5"><ErrorBanner message={error} /></div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {TYPES.map(([type, label]) => {
                const p = byType.get(type);
                return (
                  <tr key={type} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-3 font-medium text-slate-900">{label}</td>
                    <td className="px-5 py-3">
                      {p ? (
                        <Badge>{p.status === 'PUBLISHED' ? 'Published' : 'Draft'}{p.generated ? '' : ' · edited'} · v{p.version}</Badge>
                      ) : (
                        <span className="text-xs text-slate-400">Not created</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => setEditing(editing === type ? null : type)} className="text-xs font-medium text-indigo-600 hover:underline">
                        {editing === type ? 'Close' : p ? 'Edit' : 'Create'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {editing && (
        <PolicyEditor
          storeId={selectedId}
          type={editing}
          label={TYPES.find(([t]) => t === editing)?.[1] ?? editing}
          existing={byType.get(editing)}
          onSaved={() => { reload(); }}
        />
      )}
    </div>
  );
}

function PolicyEditor({ storeId, type, label, existing, onSaved }) {
  const [body, setBody] = useState(existing?.body ?? '');
  const [title, setTitle] = useState(existing?.title ?? label);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  async function generate() {
    setBusy('gen'); setError('');
    try {
      const p = await api.legal.generate({ storeId, type });
      setBody(p.body); setTitle(p.title); setSaved('Generated from template — review & save.');
      onSaved();
    } catch (e) { setError(e.message); } finally { setBusy(''); }
  }
  async function save(status) {
    setBusy(status); setError('');
    try {
      await api.legal.set({ storeId, type, title, body, status });
      setSaved(status === 'PUBLISHED' ? 'Saved & published.' : 'Saved as draft.');
      onSaved();
    } catch (e) { setError(e.message); } finally { setBusy(''); }
  }

  return (
    <Card>
      <CardHeader title={label} subtitle="Review and edit before publishing" action={<Button variant="secondary" onClick={generate} loading={busy === 'gen'}>Generate from template</Button>} />
      <div className="space-y-4 p-5">
        <ErrorBanner message={error} />
        <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Body (markdown)">
          <Textarea rows={16} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Click “Generate from template” to start, then edit." />
        </Field>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => save('DRAFT')} loading={busy === 'DRAFT'} disabled={!body.trim()}>Save draft</Button>
          <Button onClick={() => save('PUBLISHED')} loading={busy === 'PUBLISHED'} disabled={!body.trim()}>Save &amp; publish</Button>
          {saved && <span className="text-sm text-emerald-600">{saved}</span>}
        </div>
      </div>
    </Card>
  );
}
