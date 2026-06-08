import { useState } from 'react';
import { FlaskConical, Play, Pause, Square, Trophy, Plus, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { useStores } from '../context/StoreContext';
import { useAsync } from '../hooks/useAsync';
import { Card, CardHeader, Button, Spinner, EmptyState, Input, Select, Badge, formatMoney } from '../components/ui';

const STATUS_TINT = {
  DRAFT: 'bg-slate-100 text-slate-600', RUNNING: 'bg-emerald-50 text-emerald-700',
  PAUSED: 'bg-amber-50 text-amber-700', ENDED: 'bg-slate-100 text-slate-500',
};
const pct = (n) => (n == null ? '—' : `${(n * 100).toFixed(1)}%`);

export default function Experiments() {
  const { selectedId, selectedStore } = useStores();
  const [refresh, setRefresh] = useState(0);
  const { data: experiments, loading } = useAsync(
    () => (selectedId ? api.experiments.list(selectedId) : Promise.resolve([])),
    [selectedId, refresh],
  );
  const reload = () => setRefresh((n) => n + 1);

  if (!selectedId) return <EmptyState icon={FlaskConical} title="Select a store" />;
  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Storefront experiments</h1>
          <p className="text-xs text-slate-500">{selectedStore?.name} · A/B split &amp; cohort-targeted home-page variants</p>
        </div>
        <CreateExperiment storeId={selectedId} onCreated={reload} />
      </div>

      {!experiments?.length ? (
        <EmptyState icon={FlaskConical} title="No experiments yet">
          Create one to A/B test your home page or show different variants to different cohorts.
        </EmptyState>
      ) : (
        experiments.map((exp) => <ExperimentCard key={exp.id} exp={exp} onChange={reload} />)
      )}
    </div>
  );
}

function CreateExperiment({ storeId, onCreated }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [mode, setMode] = useState('SPLIT');
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      // Seeds Control (cloned from the live home page) + one challenger.
      await api.experiments.create({ storeId, name: name.trim(), slug: 'home', mode, variants: [{ name: 'Variant B', weight: 50 }] });
      setOpen(false); setName(''); onCreated();
    } finally { setBusy(false); }
  }

  if (!open) return <Button onClick={() => setOpen(true)}><Plus size={15} /> New experiment</Button>;
  return (
    <Card className="w-80 p-4">
      <div className="space-y-2">
        <Input placeholder="Experiment name (e.g. Hero test)" value={name} onChange={(e) => setName(e.target.value)} />
        <Select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="SPLIT">A/B split (random)</option>
          <option value="TARGETED">Cohort-targeted</option>
        </Select>
        <div className="flex gap-2">
          <Button loading={busy} onClick={create} disabled={!name.trim()}>Create</Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
        <p className="text-xs text-slate-400">Control is cloned from your live home page; edit Variant B's content in Design.</p>
      </div>
    </Card>
  );
}

function ExperimentCard({ exp, onChange }) {
  const { data: results } = useAsync(() => (exp.status !== 'DRAFT' ? api.experiments.results(exp.id) : Promise.resolve(null)), [exp.id, exp.status]);
  const [busy, setBusy] = useState('');

  const act = async (fn) => { setBusy('x'); try { await fn(); onChange(); } finally { setBusy(''); } };
  const setStatus = (status) => act(() => api.experiments.setStatus(exp.id, status));
  const promote = (variantId) => act(() => api.experiments.promote(exp.id, variantId));

  const rowFor = (vid) => results?.variants?.find((r) => r.variantId === vid);

  return (
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2">{exp.name} <Badge>{exp.mode === 'SPLIT' ? 'A/B' : 'Targeted'}</Badge> <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_TINT[exp.status]}`}>{exp.status}</span></span>}
        subtitle={results ? `Primary metric: ${results.primaryMetric}` : `Surface: /${exp.slug}`}
        action={
          <div className="flex items-center gap-2">
            {exp.status === 'DRAFT' || exp.status === 'PAUSED' ? <Button onClick={() => setStatus('RUNNING')} loading={busy === 'x'}><Play size={14} /> Start</Button> : null}
            {exp.status === 'RUNNING' ? <Button variant="secondary" onClick={() => setStatus('PAUSED')}><Pause size={14} /> Pause</Button> : null}
            {exp.status !== 'ENDED' ? <Button variant="secondary" onClick={() => setStatus('ENDED')}><Square size={14} /> End</Button> : null}
          </div>
        }
      />
      <div className="overflow-x-auto p-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400">
              <th className="pb-2">Variant</th><th className="pb-2">Audience / weight</th>
              <th className="pb-2 text-right">Exposures</th><th className="pb-2 text-right">Add-to-cart</th>
              <th className="pb-2 text-right">Paid conv.</th><th className="pb-2 text-right">Rev/visitor</th>
              <th className="pb-2 text-right">Uplift</th><th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {exp.variants.map((v) => {
              const r = rowFor(v.id);
              const isWinner = results?.winnerVariantId === v.id;
              return (
                <tr key={v.id} className="border-t border-slate-50">
                  <td className="py-2 font-medium text-slate-900">
                    {v.name}{v.isControl && <span className="ml-1.5 text-[10px] text-slate-400">CONTROL</span>}
                    {isWinner && <Trophy size={13} className="ml-1 inline text-amber-500" />}
                  </td>
                  <td className="py-2 text-xs text-slate-500">{exp.mode === 'SPLIT' ? `weight ${v.weight}` : (v.audienceKind === 'ALL' ? 'everyone' : `${v.audienceKind}: ${v.audienceValue}`)}</td>
                  <td className="py-2 text-right">{r?.exposures ?? '—'}</td>
                  <td className="py-2 text-right">{r ? pct(r.addToCartRate) : '—'}</td>
                  <td className="py-2 text-right">{r ? pct(r.paidConversion) : '—'}</td>
                  <td className="py-2 text-right">{r ? formatMoney(r.revenuePerVisitorMinor) : '—'}</td>
                  <td className={`py-2 text-right ${r?.significant ? 'font-semibold text-emerald-600' : 'text-slate-400'}`}>
                    {r?.uplift == null ? '—' : `${r.uplift > 0 ? '+' : ''}${(r.uplift * 100).toFixed(0)}%`}{r?.significant ? ' ✓' : ''}
                  </td>
                  <td className="py-2 text-right">
                    {exp.status !== 'ENDED' && !v.isControl && <Button variant="secondary" onClick={() => promote(v.id)} loading={busy === 'x'}><Trophy size={13} /> Promote</Button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {results && results.primaryMetric === 'exposure' && <p className="mt-3 text-xs text-slate-400">Not enough conversions yet to declare a winner — keep it running.</p>}
        {results?.winnerVariantId && <p className="mt-3 text-xs text-emerald-600">A variant is winning with significance — Promote it to make it live for everyone.</p>}
      </div>
    </Card>
  );
}
