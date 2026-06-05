import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

function Pill({ status }) {
  const cls = status === 'SUSPENDED' ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300';
  return <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{status}</span>;
}

export default function TenantDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const [tenant, setTenant] = useState(null);
  const [error, setError] = useState('');
  const canWrite = can('platform:tenants:write');

  function load() {
    api.tenants.get(id).then(setTenant).catch((e) => setError(e.message));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function toggleTenant() {
    const fn = tenant.status === 'SUSPENDED' ? api.tenants.reactivate : api.tenants.suspend;
    await fn(id);
    load();
  }
  async function toggleStore(s) {
    const fn = s.status === 'SUSPENDED' ? api.stores.reactivate : api.stores.suspend;
    await fn(s.id);
    load();
  }

  if (error) return <p className="text-rose-400">{error}</p>;
  if (!tenant) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="space-y-6">
      <Link to="/tenants" className="text-sm text-slate-400 hover:text-white">← Tenants</Link>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{tenant.name}</h1>
          <p className="text-sm text-slate-400">{tenant.members} members · {tenant.stores.length} stores · since {new Date(tenant.createdAt).toLocaleDateString()}</p>
        </div>
        <div className="flex items-center gap-3">
          <Pill status={tenant.status} />
          {canWrite && (
            <button
              onClick={toggleTenant}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tenant.status === 'SUSPENDED' ? 'bg-emerald-600' : 'bg-rose-600'} text-white`}
            >
              {tenant.status === 'SUSPENDED' ? 'Reactivate tenant' : 'Suspend tenant'}
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-left text-xs text-slate-400">
            <tr>
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3">Products</th>
              <th className="px-4 py-3">Orders</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {tenant.stores.map((s) => (
              <tr key={s.id} className="border-t border-slate-800">
                <td className="px-4 py-3">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-slate-500">/{s.slug}</div>
                </td>
                <td className="px-4 py-3 text-slate-400">{s.products}</td>
                <td className="px-4 py-3 text-slate-400">{s.orders}</td>
                <td className="px-4 py-3"><Pill status={s.status} /></td>
                <td className="px-4 py-3 text-right">
                  {canWrite && (
                    <button onClick={() => toggleStore(s)} className="text-xs text-slate-300 hover:text-white">
                      {s.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
