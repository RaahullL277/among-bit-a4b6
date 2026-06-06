import { useState } from 'react';
import { Plug, CheckCircle2 } from 'lucide-react';
import { api } from '../api/client';
import { useStores } from '../context/StoreContext';
import { useAsync } from '../hooks/useAsync';
import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Spinner,
  ErrorBanner,
  EmptyState,
} from '../components/ui';

// Provider definitions: which credential fields each adapter expects.
const PROVIDERS = [
  {
    name: 'RAZORPAY',
    label: 'Razorpay',
    kind: 'Payments',
    fields: [
      { key: 'keyId', label: 'Key ID' },
      { key: 'keySecret', label: 'Key Secret', secret: true },
      { key: 'webhookSecret', label: 'Webhook Secret', secret: true },
    ],
  },
  {
    name: 'GOKWIK',
    label: 'GoKwik',
    kind: 'Payments / Checkout',
    fields: [
      { key: 'appId', label: 'App ID' },
      { key: 'appSecret', label: 'App Secret', secret: true },
      { key: 'webhookSecret', label: 'Webhook Secret', secret: true },
    ],
  },
  {
    name: 'WHATSAPP',
    label: 'WhatsApp',
    kind: 'Messaging',
    fields: [
      { key: 'phoneNumberId', label: 'Phone Number ID' },
      { key: 'token', label: 'Access Token', secret: true },
    ],
  },
  {
    name: 'RESEND',
    label: 'Email (Resend)',
    kind: 'Notifications',
    fields: [
      { key: 'apiKey', label: 'API Key', secret: true },
      { key: 'fromAddress', label: 'From Address' },
    ],
  },
  {
    name: 'MSG91',
    label: 'SMS (MSG91)',
    kind: 'Notifications',
    fields: [
      { key: 'authKey', label: 'Auth Key', secret: true },
      { key: 'senderId', label: 'Sender ID' },
    ],
  },
  {
    name: 'DELHIVERY',
    label: 'Delhivery',
    kind: 'Shipping',
    fields: [
      { key: 'token', label: 'API Token', secret: true },
      { key: 'pickupName', label: 'Pickup Location' },
      { key: 'webhookSecret', label: 'Webhook Secret', secret: true },
    ],
  },
  {
    name: 'KLAVIYO',
    label: 'Klaviyo',
    kind: 'Marketing email',
    fields: [
      { key: 'apiKey', label: 'API Key', secret: true },
      { key: 'listId', label: 'List ID' },
    ],
  },
  {
    name: 'MAILCHIMP',
    label: 'Mailchimp',
    kind: 'Marketing email',
    fields: [
      { key: 'apiKey', label: 'API Key', secret: true },
      { key: 'listId', label: 'Audience ID' },
    ],
  },
  {
    name: 'BREVO',
    label: 'Brevo (Sendinblue)',
    kind: 'Marketing email',
    fields: [
      { key: 'apiKey', label: 'API Key', secret: true },
      { key: 'listId', label: 'List ID' },
    ],
  },
];

function ProviderCard({ def, configured, storeId, onSaved }) {
  const [creds, setCreds] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      // Drop empty fields so partial updates don't overwrite with blanks.
      const credentials = Object.fromEntries(Object.entries(creds).filter(([, v]) => v !== ''));
      await api.integrations.configure({ storeId, provider: def.name, credentials });
      setCreds({});
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={def.label}
        subtitle={def.kind}
        action={
          configured ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
              <CheckCircle2 size={14} /> Connected
            </span>
          ) : (
            <span className="text-xs text-slate-400">Not configured</span>
          )
        }
      />
      <form onSubmit={save} className="space-y-3 p-5">
        {def.fields.map((f) => (
          <Field key={f.key} label={f.label}>
            <Input
              type={f.secret ? 'password' : 'text'}
              value={creds[f.key] ?? ''}
              onChange={(e) => setCreds({ ...creds, [f.key]: e.target.value })}
              placeholder={configured ? '•••••• (leave blank to keep)' : ''}
            />
          </Field>
        ))}
        <ErrorBanner message={error} />
        <Button type="submit" loading={saving} className="w-full">
          {configured ? 'Update credentials' : 'Connect'}
        </Button>
      </form>
    </Card>
  );
}

function MarketingSync({ storeId }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  async function run() {
    setBusy(true);
    setMsg('');
    try {
      const r = await api.marketing.sync(storeId);
      setMsg(r.providers ? `Synced ${r.customers} customer(s) to ${r.providers} provider(s).` : 'No marketing providers enabled.');
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
      <Button variant="secondary" onClick={run} loading={busy}>Sync customers</Button>
    </div>
  );
}

export default function Integrations() {
  const { selectedId, selectedStore } = useStores();
  const { data: configured, loading, error, reload } = useAsync(
    () => (selectedId ? api.integrations.list(selectedId) : Promise.resolve([])),
    [selectedId],
  );

  if (!selectedId) {
    return (
      <Card>
        <EmptyState icon={Plug} title="Select a store">
          Choose a store from the switcher above to configure its integrations.
        </EmptyState>
      </Card>
    );
  }

  const configuredNames = new Set((configured ?? []).map((c) => c.provider));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Integrations</h1>
        <MarketingSync storeId={selectedId} />
      </div>
      <p className="text-sm text-slate-500">
        Credentials are encrypted at rest. {selectedStore?.name} uses the active payment provider for checkout.
      </p>
      <ErrorBanner message={error} />

      {loading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {PROVIDERS.map((def) => (
            <ProviderCard
              key={def.name}
              def={def}
              configured={configuredNames.has(def.name)}
              storeId={selectedId}
              onSaved={reload}
            />
          ))}
        </div>
      )}
    </div>
  );
}
