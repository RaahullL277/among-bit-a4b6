import { useState } from 'react';
import { Megaphone, RefreshCw, Plug } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useStores } from '../context/StoreContext';
import { useAsync } from '../hooks/useAsync';
import { Button, Card, CardHeader, Spinner, ErrorBanner, Badge, EmptyState } from '../components/ui';

const PROVIDER_LABEL = { KLAVIYO: 'Klaviyo', MAILCHIMP: 'Mailchimp', BREVO: 'Brevo' };

export default function Marketing() {
  const { selectedId, selectedStore } = useStores();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const { data: providers, loading, error } = useAsync(
    () => (selectedId ? api.marketing.providers(selectedId) : Promise.resolve([])),
    [selectedId],
  );

  async function sync() {
    setBusy(true);
    setMsg('');
    try {
      const r = await api.marketing.sync(selectedId);
      setMsg(`Synced ${r.customers} customers to ${r.providers} provider${r.providers === 1 ? '' : 's'}.`);
    } finally {
      setBusy(false);
    }
  }

  if (!selectedId) {
    return <Card><EmptyState icon={Megaphone} title="Select a store">Choose a store to manage email marketing.</EmptyState></Card>;
  }
  if (loading) return <Spinner />;
  if (error) return <Card><div className="p-5"><ErrorBanner message={error} /></div></Card>;

  const enabled = providers ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Email marketing</h1>
        <p className="text-sm text-slate-500">
          Sync customers to your connected email platform (ESP). Flows &amp; campaigns live in the ESP;
          lifecycle/automation messaging lives in <Link to="/automation" className="text-indigo-600 hover:underline">Automation</Link>.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Connected providers"
          subtitle={selectedStore?.name}
          action={<Button onClick={sync} loading={busy} disabled={!enabled.length}><RefreshCw size={14} /> Sync all customers</Button>}
        />
        {enabled.length === 0 ? (
          <EmptyState icon={Plug} title="No email provider connected">
            <p className="mb-3">Connect Klaviyo, Mailchimp, or Brevo to sync your customer list.</p>
            <Link to="/integrations"><Button variant="secondary"><Plug size={14} /> Go to Integrations</Button></Link>
          </EmptyState>
        ) : (
          <div className="flex flex-wrap gap-2 p-5">
            {enabled.map((p) => (
              <div key={p} className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3">
                <Megaphone size={16} className="text-emerald-600" />
                <span className="text-sm font-medium text-slate-900">{PROVIDER_LABEL[p] ?? p}</span>
                <Badge>Connected</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {msg && <div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{msg}</div>}

      <Card>
        <div className="px-5 py-4 text-xs text-slate-400">
          Customers also sync automatically on signup and on order. New contacts respect marketing consent — see a customer's
          profile to manage their opt-in.
        </div>
      </Card>
    </div>
  );
}
