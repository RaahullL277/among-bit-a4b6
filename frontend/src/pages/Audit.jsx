import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Card, CardHeader, Spinner, ErrorBanner, EmptyState, Select } from '../components/ui';

const ACTOR_BADGE = {
  user: 'bg-indigo-100 text-indigo-700',
  apiKey: 'bg-slate-100 text-slate-600',
  partner: 'bg-amber-100 text-amber-700',
};

export default function Audit() {
  const [actorKind, setActorKind] = useState('');
  const { data, loading, error } = useAsync(
    () => api.audit.list({ limit: 200, actorKind: actorKind || undefined }),
    [actorKind],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Audit log</h1>
        <p className="text-sm text-slate-500">Every change made to this account — by your team, an API key, or a partner managing your store.</p>
      </div>

      <Card>
        <CardHeader
          title="Recent activity"
          action={
            <Select value={actorKind} onChange={(e) => setActorKind(e.target.value)}>
              <option value="">All actors</option>
              <option value="user">Team members</option>
              <option value="partner">Partners</option>
              <option value="apiKey">API keys</option>
            </Select>
          }
        />
        {loading ? (
          <Spinner />
        ) : error ? (
          <div className="p-5"><ErrorBanner message={error} /></div>
        ) : (data ?? []).length === 0 ? (
          <EmptyState icon={ScrollText} title="No activity yet">Changes will appear here as your team and partners work.</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2">Action</th><th className="px-5 py-2">Actor</th>
                <th className="px-5 py-2">Path</th><th className="px-5 py-2">Status</th><th className="px-5 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((e) => (
                <tr key={e.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-2 font-medium text-slate-800">{e.action}</td>
                  <td className="px-5 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${ACTOR_BADGE[e.actorKind] ?? 'bg-slate-100 text-slate-600'}`}>{e.actorKind}</span>
                  </td>
                  <td className="px-5 py-2 text-xs text-slate-500">{e.method} {e.path}</td>
                  <td className="px-5 py-2 text-slate-500">{e.statusCode}</td>
                  <td className="px-5 py-2 text-xs text-slate-400">{new Date(e.createdAt).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
