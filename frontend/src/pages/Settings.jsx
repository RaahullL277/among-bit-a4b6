import { useState } from 'react';
import { Plus, KeyRound, Copy, Trash2 } from 'lucide-react';
import { api, BASE_URL } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Modal,
  Spinner,
  ErrorBanner,
  EmptyState,
} from '../components/ui';

export default function Settings() {
  const { data: keys, loading, error, reload } = useAsync(() => api.apiKeys.list(), []);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [createdKey, setCreatedKey] = useState('');
  const [formError, setFormError] = useState('');

  async function create(e) {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      const created = await api.apiKeys.create({ name });
      setCreatedKey(created.raw);
      setName('');
      setOpen(false);
      reload();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function revoke(id) {
    await api.apiKeys.revoke(id);
    reload();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-slate-900">Settings</h1>

      <Card className="p-5">
        <div className="text-xs font-medium text-slate-500">API base URL</div>
        <div className="font-mono text-sm text-slate-800">{BASE_URL}</div>
      </Card>

      {createdKey && (
        <Card className="border-emerald-200 bg-emerald-50 p-5">
          <div className="text-sm font-medium text-emerald-800">New API key — copy it now, it won't be shown again.</div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-white px-3 py-2 font-mono text-sm text-slate-800">
              {createdKey}
            </code>
            <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(createdKey)}>
              <Copy size={14} /> Copy
            </Button>
            <Button variant="ghost" onClick={() => setCreatedKey('')}>
              Dismiss
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="API keys"
          subtitle="Authenticate the REST API and MCP server"
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus size={15} /> New key
            </Button>
          }
        />
        {loading ? (
          <Spinner />
        ) : error ? (
          <div className="p-5">
            <ErrorBanner message={error} />
          </div>
        ) : keys?.length === 0 ? (
          <EmptyState icon={KeyRound} title="No API keys" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Prefix</th>
                <th className="px-5 py-3 font-medium">Last used</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {keys?.map((k) => (
                <tr key={k.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-3 font-medium text-slate-900">{k.name}</td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">{k.prefix}…</td>
                  <td className="px-5 py-3 text-slate-500">
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{k.revokedAt ? 'Revoked' : 'Active'}</td>
                  <td className="px-5 py-3 text-right">
                    {!k.revokedAt && (
                      <button
                        onClick={() => revoke(k.id)}
                        className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700"
                      >
                        <Trash2 size={13} /> Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="New API key">
        <form onSubmit={create} className="space-y-4">
          <Field label="Name" hint="A label to identify where this key is used.">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="storefront-server" />
          </Field>
          <ErrorBanner message={formError} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={!name.trim()}>
              Create key
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
