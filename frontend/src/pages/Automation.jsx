import { useState } from 'react';
import { Send, Sparkles, Play, Power, Clock, Mail, MessageSquare, Smartphone } from 'lucide-react';
import { api } from '../api/client';
import { useStores } from '../context/StoreContext';
import { useAsync } from '../hooks/useAsync';
import { Button, Card, CardHeader, Spinner, ErrorBanner, Badge, EmptyState, Field, Input, Select } from '../components/ui';

const TRIGGERS = {
  NEW_IN_STOCK: 'New in stock',
  BEST_SELLING: 'Best selling',
  SLOW_MOVING: 'Slow-moving stock',
  LOW_STOCK: 'Low stock',
  BACK_IN_STOCK: 'Back in stock',
  DISCOUNT: 'Discount',
  FESTIVE_DISCOUNT: 'Festive discount',
  ABANDONED_CART: 'Abandoned cart',
  COHORT_OFFER: 'Cohort offer',
};
const CHANNEL_ICON = { EMAIL: Mail, SMS: Smartphone, WHATSAPP: MessageSquare };
const TONE_BADGE = {
  friendly: 'bg-sky-100 text-sky-700', urgent: 'bg-rose-100 text-rose-700',
  premium: 'bg-violet-100 text-violet-700', playful: 'bg-amber-100 text-amber-700', value: 'bg-emerald-100 text-emerald-700',
};
const STATUS_BADGE = {
  SENT: 'bg-emerald-100 text-emerald-700', SUPPRESSED: 'bg-amber-100 text-amber-700',
  SKIPPED: 'bg-slate-100 text-slate-600', FAILED: 'bg-rose-100 text-rose-700',
};
const TABS = ['Automations', 'Templates', 'Frequency'];

export default function Automation() {
  const { selectedId, selectedStore } = useStores();
  const [tab, setTab] = useState('Automations');

  if (!selectedId) {
    return (
      <Card>
        <EmptyState icon={Send} title="Select a store">Choose a store to manage its engagement automations.</EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Engagement automation</h1>
        <p className="text-sm text-slate-500">
          Nine lifecycle triggers, 5 hyper-personalised templates per channel. The frequency agent caps sends by hot/warm/cold,
          and a customer in many cohorts still gets just their single best message.
        </p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${tab === t ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Automations' && <AutomationsTab storeId={selectedId} store={selectedStore} />}
      {tab === 'Templates' && <TemplatesTab />}
      {tab === 'Frequency' && <FrequencyTab storeId={selectedId} />}
    </div>
  );
}

// --- Automations: campaigns + run + log -------------------------------------

function AutomationsTab({ storeId, store }) {
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const { data: campaigns, loading, error, reload } = useAsync(() => api.engagement.campaigns(storeId), [storeId]);
  const { data: log, reload: reloadLog } = useAsync(() => api.engagement.log(storeId, 50), [storeId]);

  async function setupDefaults() {
    setBusy('setup');
    try { await api.engagement.setupDefaults(storeId, 'WHATSAPP'); reload(); } finally { setBusy(''); }
  }
  async function toggle(c) {
    await api.engagement.setCampaign({ storeId, trigger: c.trigger, channel: c.channel, enabled: !c.enabled });
    reload();
  }
  async function run(dryRun) {
    setBusy(dryRun ? 'dry' : 'send');
    setResult(null);
    try {
      const r = await api.engagement.run(storeId, dryRun);
      setResult({ dryRun, ...r });
      if (!dryRun) reloadLog();
    } finally { setBusy(''); }
  }

  if (loading) return <Spinner />;
  if (error) return <Card><div className="p-5"><ErrorBanner message={error} /></div></Card>;

  const list = campaigns ?? [];

  return (
    <div className="space-y-6">
      {list.length === 0 ? (
        <Card>
          <EmptyState icon={Sparkles} title="No automations yet">
            <p className="mb-3">Turn on the recommended set — every trigger enabled, with smart frequency caps.</p>
            <Button onClick={setupDefaults} loading={busy === 'setup'}>Turn on recommended automations</Button>
          </EmptyState>
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="Active automations"
            subtitle={`${list.filter((c) => c.enabled).length}/${list.length} enabled · ${store?.name}`}
            action={
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => run(true)} loading={busy === 'dry'}><Play size={14} /> Preview run</Button>
                <Button onClick={() => run(false)} loading={busy === 'send'}><Send size={14} /> Run now</Button>
              </div>
            }
          />
          <div className="grid grid-cols-1 gap-2 p-4 md:grid-cols-2 lg:grid-cols-3">
            {list.map((c) => {
              const Icon = CHANNEL_ICON[c.channel] ?? Mail;
              return (
                <div key={c.id} className={`flex items-center justify-between rounded-xl border p-3 ${c.enabled ? 'border-slate-200' : 'border-dashed border-slate-200 opacity-60'}`}>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900">{TRIGGERS[c.trigger] ?? c.trigger}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500"><Icon size={12} /> {c.channel}{c.cohortKey ? ` · ${c.cohortKey}` : ''}</div>
                  </div>
                  <button onClick={() => toggle(c)} title={c.enabled ? 'Disable' : 'Enable'} className={`rounded-lg p-1.5 ${c.enabled ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'}`}>
                    <Power size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {result && (
        <div className={`rounded-lg px-4 py-3 text-sm ${result.dryRun ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {result.note === 'no_enabled_campaigns'
            ? 'No enabled automations to run.'
            : `${result.dryRun ? 'Preview' : 'Run'}: considered ${result.considered} customers → ${result.sent} ${result.dryRun ? 'would send' : 'sent'}, ${result.suppressed} suppressed (frequency/dedup), ${result.skipped} skipped (no contact).`}
        </div>
      )}

      <Card>
        <CardHeader title="Send log" subtitle="The audit trail behind the frequency caps & cross-cohort dedup" />
        {(log ?? []).length === 0 ? (
          <EmptyState icon={Clock} title="Nothing sent yet">Run an automation to see delivery history.</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2">Trigger</th><th className="px-5 py-2">To</th><th className="px-5 py-2">Temp</th>
                <th className="px-5 py-2">Status</th><th className="px-5 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {(log ?? []).map((m) => (
                <tr key={m.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-2 font-medium text-slate-800">{TRIGGERS[m.trigger] ?? m.trigger}</td>
                  <td className="px-5 py-2 text-slate-500">{m.to || '—'}</td>
                  <td className="px-5 py-2"><Badge>{m.temperature ?? '—'}</Badge></td>
                  <td className="px-5 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[m.status]}`}>{m.status}</span>
                    {m.reason && <span className="ml-1.5 text-[11px] text-slate-400">{m.reason}</span>}
                  </td>
                  <td className="px-5 py-2 text-slate-400">{new Date(m.createdAt).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// --- Templates: the 5-variant library ---------------------------------------

function TemplatesTab() {
  const { data: library, loading, error } = useAsync(() => api.engagement.library(), []);
  const [open, setOpen] = useState(null);

  if (loading) return <Spinner />;
  if (error) return <Card><div className="p-5"><ErrorBanner message={error} /></div></Card>;

  return (
    <div className="space-y-3">
      {(library ?? []).map((row) => {
        const total = row.channels.reduce((n, c) => n + c.templates.length, 0);
        const isOpen = open === row.trigger;
        return (
          <Card key={row.trigger}>
            <button onClick={() => setOpen(isOpen ? null : row.trigger)} className="flex w-full items-center justify-between px-5 py-4 text-left">
              <span className="text-sm font-semibold text-slate-900">{TRIGGERS[row.trigger] ?? row.trigger}</span>
              <span className="text-xs text-slate-400">{total} templates · 5 per channel</span>
            </button>
            {isOpen && (
              <div className="space-y-4 border-t border-slate-100 p-5">
                {row.channels.map((ch) => {
                  const Icon = CHANNEL_ICON[ch.channel] ?? Mail;
                  return (
                    <div key={ch.channel}>
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500"><Icon size={13} /> {ch.channel}</div>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                        {ch.templates.map((t) => (
                          <div key={t.key} className="rounded-lg border border-slate-200 p-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-slate-700">{t.name}</span>
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TONE_BADGE[t.tone]}`}>{t.tone}</span>
                            </div>
                            {t.subject && <div className="mt-1.5 text-[11px] font-medium text-slate-500">“{t.subject}”</div>}
                            <p className="mt-1 text-xs leading-relaxed text-slate-600">{t.body}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// --- Frequency: the policy editor -------------------------------------------

function FrequencyTab({ storeId }) {
  const { data: policy, loading, error, reload } = useAsync(() => api.engagement.getPolicy(storeId), [storeId]);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const p = form ?? policy;
  function set(k, v) { setForm({ ...(form ?? policy), [k]: Number(v) }); setSaved(false); }
  async function save() {
    setBusy(true);
    try {
      await api.engagement.setPolicy({ storeId, ...p });
      setSaved(true); setForm(null); reload();
    } finally { setBusy(false); }
  }

  if (loading) return <Spinner />;
  if (error) return <Card><div className="p-5"><ErrorBanner message={error} /></div></Card>;

  return (
    <Card>
      <CardHeader
        title="Frequency & fatigue policy"
        subtitle="The frequency-adjustment agent: how many promo messages each temperature gets, plus the global guard against over-messaging."
      />
      <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-3">
        <Field label="HOT — max / 7 days" hint="Recently purchased (≤30d). Most engaged.">
          <Input type="number" min={0} value={p.hotMaxPer7Days} onChange={(e) => set('hotMaxPer7Days', e.target.value)} />
        </Field>
        <Field label="WARM — max / 7 days" hint="Bought 30–90 days ago.">
          <Input type="number" min={0} value={p.warmMaxPer7Days} onChange={(e) => set('warmMaxPer7Days', e.target.value)} />
        </Field>
        <Field label="COLD — max / 7 days" hint="Lapsed / never bought. Re-engage gently.">
          <Input type="number" min={0} value={p.coldMaxPer7Days} onChange={(e) => set('coldMaxPer7Days', e.target.value)} />
        </Field>
        <Field label="Per-customer daily cap" hint="Cross-cohort guard: total messages/day for any one customer.">
          <Input type="number" min={1} value={p.perCustomerDailyCap} onChange={(e) => set('perCustomerDailyCap', e.target.value)} />
        </Field>
        <Field label="Min hours between sends" hint="Minimum gap between any two messages.">
          <Input type="number" min={0} value={p.minHoursBetween} onChange={(e) => set('minHoursBetween', e.target.value)} />
        </Field>
        <Field label="Quiet hours" hint="No sends in this window (24h).">
          <div className="flex items-center gap-2">
            <Input type="number" min={0} max={23} value={p.quietStartHour} onChange={(e) => set('quietStartHour', e.target.value)} />
            <span className="text-slate-400">to</span>
            <Input type="number" min={0} max={23} value={p.quietEndHour} onChange={(e) => set('quietEndHour', e.target.value)} />
          </div>
        </Field>
      </div>
      <div className="flex items-center gap-3 border-t border-slate-100 px-5 py-3">
        <Button onClick={save} loading={busy} disabled={!form}>Save policy</Button>
        {saved && <span className="text-sm text-emerald-600">Saved.</span>}
        {policy?.isDefault && !form && <span className="text-xs text-slate-400">Showing defaults — save to customise.</span>}
      </div>
    </Card>
  );
}
