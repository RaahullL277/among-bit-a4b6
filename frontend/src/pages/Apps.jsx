import { useState } from 'react';
import { Puzzle, Power, Trash2, Check } from 'lucide-react';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Button, Card, CardHeader, Spinner, ErrorBanner, Badge, EmptyState } from '../components/ui';

export default function Apps() {
  const [busy, setBusy] = useState('');
  const { data: catalog, loading, error } = useAsync(() => api.apps.catalog(), []);
  const { data: installed, reload } = useAsync(() => api.apps.installed(), []);

  const installedByAppId = new Map((installed ?? []).map((i) => [i.app.id, i]));

  async function install(app) {
    setBusy(app.id);
    try { await api.apps.install(app.id); reload(); } finally { setBusy(''); }
  }
  async function toggle(inst) {
    setBusy(inst.app.id);
    try { await api.apps.setEnabled(inst.app.id, !inst.enabled); reload(); } finally { setBusy(''); }
  }
  async function uninstall(inst) {
    setBusy(inst.app.id);
    try { await api.apps.uninstall(inst.app.id); reload(); } finally { setBusy(''); }
  }

  if (loading) return <Spinner />;
  if (error) return <Card><div className="p-5"><ErrorBanner message={error} /></div></Card>;

  const apps = catalog ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">App marketplace</h1>
        <p className="text-sm text-slate-500">Extend your store with apps. Installing an app grants it the scopes it requests; you can disable or remove it anytime.</p>
      </div>

      {(installed ?? []).length > 0 && (
        <Card>
          <CardHeader title="Installed" subtitle={`${installed.length} app${installed.length === 1 ? '' : 's'}`} />
          <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 lg:grid-cols-3">
            {installed.map((inst) => (
              <div key={inst.id} className={`rounded-xl border p-4 ${inst.enabled ? 'border-slate-200' : 'border-dashed border-slate-200 opacity-70'}`}>
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900">{inst.app.name}</div>
                    <div className="text-xs text-slate-400">{inst.app.developer ?? '—'} · {inst.app.category ?? 'App'}</div>
                  </div>
                  <Badge>{inst.enabled ? 'Enabled' : 'Disabled'}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {inst.scopes.map((s) => <span key={s} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{s}</span>)}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" onClick={() => toggle(inst)} loading={busy === inst.app.id}><Power size={13} /> {inst.enabled ? 'Disable' : 'Enable'}</Button>
                  <button onClick={() => uninstall(inst)} disabled={busy === inst.app.id} title="Uninstall" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Browse apps" />
        {apps.length === 0 ? (
          <EmptyState icon={Puzzle} title="Catalog is empty">Ask your platform operator to publish apps to the marketplace.</EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 lg:grid-cols-3">
            {apps.map((app) => {
              const inst = installedByAppId.get(app.id);
              return (
                <div key={app.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><Puzzle size={16} /></div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900">{app.name}</div>
                      <div className="text-xs text-slate-400">{app.developer ?? '—'} · {app.category ?? 'App'}</div>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{app.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(app.scopes ?? []).map((s) => <span key={s} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{s}</span>)}
                  </div>
                  <div className="mt-3">
                    {inst ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><Check size={13} /> Installed</span>
                    ) : (
                      <Button onClick={() => install(app)} loading={busy === app.id}>Install</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
