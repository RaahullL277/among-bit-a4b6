import { useState } from 'react';
import { MessageSquare, Settings, Send } from 'lucide-react';
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
  Modal,
  Spinner,
  ErrorBanner,
  Badge,
  EmptyState,
} from '../components/ui';

const STATUSES = ['', 'OPEN', 'ESCALATED', 'RESOLVED'];

function BotConfig({ storeId, open, onClose }) {
  const { data } = useAsync(() => (open ? api.support.getConfig(storeId) : Promise.resolve(null)), [storeId, open]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const cfg = form ?? (data ? {
    enabled: data.enabled, displayName: data.displayName, greeting: data.greeting ?? '', persona: data.persona ?? '',
    humanHandoffEnabled: data.humanHandoffEnabled ?? true, supportEmail: data.supportEmail ?? '', supportPhone: data.supportPhone ?? '', maxRebuttals: data.maxRebuttals ?? 2,
  } : null);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.support.setConfig({ storeId, ...cfg });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Assistant settings">
      {!cfg ? (
        <Spinner />
      ) : (
        <form onSubmit={save} className="space-y-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={cfg.enabled} onChange={(e) => setForm({ ...cfg, enabled: e.target.checked })} />
            Show the chat assistant on the storefront
          </label>
          <Field label="Display name">
            <Input value={cfg.displayName} onChange={(e) => setForm({ ...cfg, displayName: e.target.value })} />
          </Field>
          <Field label="Greeting" hint="Shown when a shopper opens the chat.">
            <Input value={cfg.greeting} onChange={(e) => setForm({ ...cfg, greeting: e.target.value })} placeholder="Hi! How can I help?" />
          </Field>
          <Field label="Persona / extra instructions" hint="Tone, policies, what to emphasize.">
            <Textarea value={cfg.persona} onChange={(e) => setForm({ ...cfg, persona: e.target.value })} />
          </Field>

          <div className="border-t border-slate-100 pt-4">
            <div className="mb-2 text-sm font-medium text-slate-700">Human handoff</div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={cfg.humanHandoffEnabled} onChange={(e) => setForm({ ...cfg, humanHandoffEnabled: e.target.checked })} />
              A human is available to take over escalated chats
            </label>
            <p className="mt-1 text-xs text-slate-400">
              After {cfg.maxRebuttals} unresolved replies the chat is handed off. If a human is available, the customer is connected to your team; otherwise they're told support will reach out via email/phone.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label="Hand off after (replies)">
                <Input type="number" min="1" max="5" value={cfg.maxRebuttals} onChange={(e) => setForm({ ...cfg, maxRebuttals: Math.max(1, Math.min(5, parseInt(e.target.value, 10) || 2)) })} />
              </Field>
              <Field label="Support email" hint="Shown to customers + escalations">
                <Input value={cfg.supportEmail} onChange={(e) => setForm({ ...cfg, supportEmail: e.target.value })} placeholder="help@store.com" />
              </Field>
              <Field label="Support phone">
                <Input value={cfg.supportPhone} onChange={(e) => setForm({ ...cfg, supportPhone: e.target.value })} placeholder="+91…" />
              </Field>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={saving}>Save</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function Transcript({ id, onChanged }) {
  const { data, loading, reload } = useAsync(() => api.support.conversation(id), [id]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  async function send(e) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    try {
      await api.support.reply(id, reply);
      setReply('');
      reload();
      onChanged?.();
    } finally {
      setSending(false);
    }
  }
  async function resolve() {
    await api.support.setStatus(id, 'RESOLVED');
    reload();
    onChanged?.();
  }

  if (loading) return <Spinner />;
  if (!data) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div>
          <div className="text-sm font-medium text-slate-900">{data.contactName ?? data.contactEmail ?? 'Visitor'}</div>
          {data.contactEmail && <div className="text-xs text-slate-400">{data.contactEmail}</div>}
        </div>
        <div className="flex items-center gap-2">
          <Badge>{data.status}</Badge>
          {data.status !== 'RESOLVED' && (
            <Button variant="secondary" onClick={resolve}>Resolve</Button>
          )}
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-auto p-5">
        {data.messages.map((m) => (
          <div key={m.id} className={`flex ${m.sender === 'CUSTOMER' ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
              m.sender === 'CUSTOMER' ? 'bg-slate-100 text-slate-800' : m.sender === 'AGENT' ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white'
            }`}>
              {m.body}
              <div className="mt-0.5 text-[10px] opacity-70">{m.sender === 'BOT' ? 'Assistant' : m.sender === 'AGENT' ? 'You' : 'Customer'}</div>
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-slate-100 p-3">
        <Input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply as a human agent…" />
        <Button type="submit" loading={sending} disabled={!reply.trim()}><Send size={14} /></Button>
      </form>
    </div>
  );
}

function BotStats({ storeId }) {
  const { data: stats } = useAsync(() => api.support.analytics(storeId), [storeId]);
  const { data: cfg } = useAsync(() => api.support.getConfig(storeId), [storeId]);
  if (!stats) return null;
  const Item = ({ label, value }) => (
    <div className="rounded-xl border border-slate-100 bg-white p-3 text-center">
      <div className="text-lg font-semibold text-slate-900">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700">
        Assistant
        <span className={`rounded-full px-2 py-0.5 text-xs ${cfg?.llmActive ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          {cfg?.llmActive ? 'AI (Claude)' : 'Basic (no AI key)'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Item label="Conversations" value={stats.conversations} />
        <Item label="Deflection" value={`${stats.deflectionRate}%`} />
        <Item label="Escalated" value={stats.escalated} />
        <Item label="Open" value={stats.open} />
        <Item label="Resolved" value={stats.resolved} />
      </div>
      {stats.topTools?.length > 0 && (
        <div className="mt-3 text-xs text-slate-400">Top tools: {stats.topTools.map((t) => `${t.name} (${t.count})`).join(' · ')}</div>
      )}
    </Card>
  );
}

export default function Support() {
  const { selectedId, selectedStore } = useStores();
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState(null);
  const [configOpen, setConfigOpen] = useState(false);
  const { data: conversations, loading, error, reload } = useAsync(
    () => (selectedId ? api.support.conversations(selectedId, status || undefined) : Promise.resolve([])),
    [selectedId, status],
  );

  if (!selectedId) {
    return (
      <Card>
        <EmptyState icon={MessageSquare} title="Select a store">Choose a store to view its support inbox.</EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Support</h1>
        <Button variant="secondary" onClick={() => setConfigOpen(true)}>
          <Settings size={15} /> Assistant settings
        </Button>
      </div>

      <BotStats storeId={selectedId} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader
            title="Conversations"
            subtitle={selectedStore?.name}
            action={
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
                {STATUSES.map((s) => <option key={s} value={s}>{s || 'All'}</option>)}
              </select>
            }
          />
          {loading ? (
            <Spinner />
          ) : error ? (
            <div className="p-5"><ErrorBanner message={error} /></div>
          ) : conversations?.length === 0 ? (
            <EmptyState icon={MessageSquare} title="No conversations yet" />
          ) : (
            <div className="divide-y divide-slate-50">
              {conversations?.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelected(c.id)}
                  className={`block w-full px-5 py-3 text-left hover:bg-slate-50 ${selected === c.id ? 'bg-indigo-50' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-900">{c.contactName ?? c.contactEmail ?? 'Visitor'}</span>
                    <Badge>{c.status}</Badge>
                  </div>
                  <div className="truncate text-xs text-slate-400">{c.preview}</div>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          {selected ? (
            <Transcript id={selected} onChanged={reload} />
          ) : (
            <EmptyState icon={MessageSquare} title="Select a conversation">
              Pick a conversation to read the transcript and reply.
            </EmptyState>
          )}
        </Card>
      </div>

      <BotConfig storeId={selectedId} open={configOpen} onClose={() => setConfigOpen(false)} />
    </div>
  );
}
