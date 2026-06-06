import { useState } from 'react';
import { Bot, Globe, ExternalLink, Power } from 'lucide-react';
import { api, BASE_URL } from '../api/client';
import { useStores } from '../context/StoreContext';
import { useAsync } from '../hooks/useAsync';
import { Button, Card, CardHeader, Spinner, ErrorBanner, EmptyState, Textarea } from '../components/ui';

const CHANNEL_BLURB = {
  CLAUDE: 'Anthropic Claude',
  CHATGPT: 'OpenAI ChatGPT',
  GEMINI: 'Google Gemini',
  PERPLEXITY: 'Perplexity',
  COPILOT: 'Microsoft Copilot',
  META_AI: 'Meta AI',
};

export default function Shopability() {
  const { selectedId, selectedStore } = useStores();
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState(null);
  const { data, loading, error, reload } = useAsync(
    () => (selectedId ? api.shopability.get(selectedId) : Promise.resolve(null)),
    [selectedId],
  );
  const { data: checkouts } = useAsync(
    () => (selectedId ? api.shopability.agentCheckouts(selectedId) : Promise.resolve([])),
    [selectedId],
  );

  async function toggleMaster() {
    setBusy('master');
    try { await api.shopability.update({ storeId: selectedId, enabled: !data.enabled }); reload(); } finally { setBusy(''); }
  }
  async function toggleChannel(c) {
    setBusy(c.channel);
    try { await api.shopability.setChannel(selectedId, c.channel, !c.enabled); reload(); } finally { setBusy(''); }
  }
  async function saveNote() {
    setBusy('note');
    try { await api.shopability.update({ storeId: selectedId, agentNote: note }); setNote(null); reload(); } finally { setBusy(''); }
  }

  if (!selectedId) {
    return <Card><EmptyState icon={Bot} title="Select a store">Choose a store to manage AI-assistant shopping.</EmptyState></Card>;
  }
  if (loading) return <Spinner />;
  if (error) return <Card><div className="p-5"><ErrorBanner message={error} /></div></Card>;
  if (!data) return null;

  const manifestUrl = `${BASE_URL}/agent/${selectedId}/manifest`;
  const feedUrl = `${BASE_URL}/agent/${selectedId}/feed`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">AI shopping (shopability)</h1>
        <p className="text-sm text-slate-500">
          Control whether external AI assistants can browse and buy from {selectedStore?.name}. This is separate from your
          website storefront — turn AI shopping on or off per assistant.
        </p>
      </div>

      {/* Master switch */}
      <Card>
        <div className="flex items-center justify-between p-5">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 rounded-lg p-2 ${data.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
              <Globe size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">
                Agentic commerce is {data.enabled ? 'ON' : 'OFF'}
              </div>
              <p className="text-sm text-slate-500">
                {data.enabled
                  ? 'AI assistants can discover your catalog and check out via the agent endpoints below.'
                  : 'All AI-assistant shopping is disabled. Agents see your store as not shoppable.'}
              </p>
            </div>
          </div>
          <Button variant={data.enabled ? 'secondary' : 'primary'} onClick={toggleMaster} loading={busy === 'master'}>
            <Power size={14} /> {data.enabled ? 'Disable' : 'Enable'}
          </Button>
        </div>
      </Card>

      {/* Per-assistant toggles */}
      <Card>
        <CardHeader title="AI assistants" subtitle="Enable or disable each shopping assistant individually" />
        <div className="grid grid-cols-1 gap-2 p-4 md:grid-cols-2 lg:grid-cols-3">
          {data.channels.map((c) => (
            <div key={c.channel} className={`flex items-center justify-between rounded-xl border p-3 ${c.enabled ? 'border-slate-200' : 'border-dashed border-slate-200'}`}>
              <div className="flex items-center gap-2.5 min-w-0">
                <Bot size={16} className={c.enabled ? 'text-indigo-600' : 'text-slate-300'} />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900">{c.label}</div>
                  <div className="truncate text-xs text-slate-400">{CHANNEL_BLURB[c.channel]}</div>
                </div>
              </div>
              <button
                onClick={() => toggleChannel(c)}
                disabled={!data.enabled || busy === c.channel}
                title={data.enabled ? (c.enabled ? 'Disable' : 'Enable') : 'Enable agentic commerce first'}
                className={`rounded-lg p-1.5 disabled:opacity-40 ${c.enabled ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'}`}
              >
                <Power size={16} />
              </button>
            </div>
          ))}
        </div>
        {!data.enabled && (
          <div className="border-t border-slate-50 px-5 py-2 text-xs text-slate-400">Turn the master switch on to manage individual assistants.</div>
        )}
      </Card>

      {/* Agent note */}
      <Card>
        <CardHeader title="Note to AI agents" subtitle="Optional guidance surfaced in your agent manifest (e.g. shipping regions, sizing)" />
        <div className="space-y-3 p-5">
          <Textarea
            rows={2}
            placeholder="e.g. Ships across India in 3–5 days. Sizes run small."
            value={note ?? data.agentNote ?? ''}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button onClick={saveNote} loading={busy === 'note'} disabled={note === null}>Save note</Button>
        </div>
      </Card>

      {/* Agent endpoints */}
      <Card>
        <CardHeader title="Agent endpoints" subtitle="What assistants read — and how owners/partners can verify the toggle" />
        <div className="space-y-2 p-5 text-sm">
          <EndpointRow label="Manifest" url={manifestUrl} hint="Tells an assistant whether it may shop" />
          <EndpointRow label="Product feed" url={feedUrl} hint="Catalog for browsing (403 when disabled)" />
        </div>
        <div className="border-t border-slate-50 px-5 py-2 text-xs text-slate-400">
          Agent purchases require a delegated-payment mandate (the buyer's authorization to pay up to a cap); checkouts without one are rejected.
        </div>
      </Card>

      {/* Agent-driven orders (attribution) */}
      <Card>
        <CardHeader title="Agent checkouts" subtitle="Purchases initiated by AI assistants — attribution & mandate audit" />
        {(checkouts ?? []).length === 0 ? (
          <div className="px-5 py-6 text-sm text-slate-400">No agent checkouts yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2">Assistant</th><th className="px-5 py-2">Status</th>
                <th className="px-5 py-2">Amount</th><th className="px-5 py-2">Mandate</th><th className="px-5 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {(checkouts ?? []).map((c) => (
                <tr key={c.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-2 font-medium text-slate-800">{c.channel ?? 'Generic'}</td>
                  <td className="px-5 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${c.status === 'AUTHORIZED' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{c.status}</span>
                    {c.reason && <span className="ml-1.5 text-[11px] text-slate-400">{c.reason}</span>}
                  </td>
                  <td className="px-5 py-2 text-slate-600">₹{(c.amountMinor / 100).toFixed(0)}</td>
                  <td className="px-5 py-2 text-xs text-slate-400">{c.mandateRef}</td>
                  <td className="px-5 py-2 text-xs text-slate-400">{new Date(c.createdAt).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function EndpointRow({ label, url, hint }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-800">{label}</div>
        <div className="truncate text-xs text-slate-400">{hint}</div>
      </div>
      <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline">
        Open <ExternalLink size={12} />
      </a>
    </div>
  );
}
