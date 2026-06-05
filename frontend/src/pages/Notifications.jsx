import { useState } from 'react';
import { Bell, Save } from 'lucide-react';
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
  Badge,
  EmptyState,
} from '../components/ui';

const CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP'];
const EVENT_LABELS = {
  ORDER_PLACED: 'Order placed',
  ORDER_PAID: 'Order paid',
  ORDER_STATUS_CHANGED: 'Order status changed',
  ABANDONED_CART: 'Abandoned cart',
  LOW_STOCK: 'Low stock',
  OUT_OF_STOCK: 'Out of stock',
};

function OwnerContact({ store, onSaved }) {
  const [email, setEmail] = useState(store.ownerEmail ?? '');
  const [phone, setPhone] = useState(store.ownerPhone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.stores.update(store.id, { ownerEmail: email, ownerPhone: phone });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Store owner contact" subtitle="Where owner alerts (orders, stock) are sent" />
      <form onSubmit={save} className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
        <Field label="Owner email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Owner phone">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+9198…" />
        </Field>
        <div className="sm:col-span-2">
          <ErrorBanner message={error} />
          <Button type="submit" loading={saving}>
            <Save size={14} /> Save contact
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PreferenceMatrix({ storeId }) {
  const { data: prefs, loading, error, reload } = useAsync(
    () => api.notifications.listPreferences(storeId),
    [storeId],
  );
  const [savingKey, setSavingKey] = useState('');

  async function toggle(pref, channel) {
    const has = pref.channels.includes(channel);
    const channels = has
      ? pref.channels.filter((c) => c !== channel)
      : [...pref.channels, channel];
    setSavingKey(`${pref.event}:${pref.recipientType}`);
    try {
      await api.notifications.setPreference({
        storeId,
        event: pref.event,
        recipientType: pref.recipientType,
        channels,
        enabled: true,
      });
      reload();
    } finally {
      setSavingKey('');
    }
  }

  if (loading) return <Spinner />;
  if (error) return <div className="p-5"><ErrorBanner message={error} /></div>;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
          <th className="px-5 py-3 font-medium">Event</th>
          <th className="px-5 py-3 font-medium">Recipient</th>
          {CHANNELS.map((c) => (
            <th key={c} className="px-3 py-3 text-center font-medium">{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {prefs?.map((p) => {
          const key = `${p.event}:${p.recipientType}`;
          return (
            <tr key={key} className="border-b border-slate-50 last:border-0">
              <td className="px-5 py-3 font-medium text-slate-900">{EVENT_LABELS[p.event] ?? p.event}</td>
              <td className="px-5 py-3 text-slate-500">
                {p.recipientType === 'STORE_OWNER' ? 'Store owner' : 'Customer'}
              </td>
              {CHANNELS.map((c) => (
                <td key={c} className="px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-indigo-600"
                    checked={p.channels.includes(c)}
                    disabled={savingKey === key}
                    onChange={() => toggle(p, c)}
                  />
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function RecentNotifications({ storeId }) {
  const { data, loading, error } = useAsync(() => api.notifications.list(storeId), [storeId]);
  if (loading) return <Spinner />;
  if (error) return <div className="p-5"><ErrorBanner message={error} /></div>;
  if (!data?.length) return <EmptyState icon={Bell} title="No notifications sent yet" />;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
          <th className="px-5 py-3 font-medium">Event</th>
          <th className="px-5 py-3 font-medium">Channel</th>
          <th className="px-5 py-3 font-medium">To</th>
          <th className="px-5 py-3 font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        {data.map((n) => (
          <tr key={n.id} className="border-b border-slate-50 last:border-0">
            <td className="px-5 py-3 text-slate-700">{EVENT_LABELS[n.event] ?? n.event}</td>
            <td className="px-5 py-3 text-slate-500">{n.channel}</td>
            <td className="px-5 py-3 text-slate-500">{n.to || '—'}</td>
            <td className="px-5 py-3">
              <Badge>{n.status}</Badge>
              {n.error && <span className="ml-2 text-xs text-slate-400">{n.error}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Notifications() {
  const { selectedId, selectedStore, refreshStores } = useStores();

  if (!selectedId) {
    return (
      <Card>
        <EmptyState icon={Bell} title="Select a store">
          Choose a store from the switcher above to manage notifications.
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-slate-900">Notifications</h1>
      <p className="text-sm text-slate-500">
        Configure channels in <span className="font-medium">Integrations</span>; choose which fire per event below.
      </p>

      {selectedStore && <OwnerContact key={selectedStore.id} store={selectedStore} onSaved={refreshStores} />}

      <Card>
        <CardHeader title="Channel preferences" subtitle="Per event and recipient" />
        <PreferenceMatrix storeId={selectedId} />
      </Card>

      <Card>
        <CardHeader title="Recent notifications" subtitle="Delivery log" />
        <RecentNotifications storeId={selectedId} />
      </Card>
    </div>
  );
}
