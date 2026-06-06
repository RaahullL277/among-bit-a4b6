import { useState } from 'react';
import { TrendingDown, RefreshCw, Wand2, Plus, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { useStores } from '../context/StoreContext';
import { useAsync } from '../hooks/useAsync';
import { Button, Card, CardHeader, Field, Input, Select, Spinner, ErrorBanner, Badge, EmptyState, formatMoney } from '../components/ui';

const POSITION_BADGE = {
  cheapest: 'bg-emerald-50 text-emerald-700',
  competitive: 'bg-indigo-50 text-indigo-700',
  expensive: 'bg-rose-50 text-rose-700',
  unknown: 'bg-slate-100 text-slate-500',
};

function RuleCard({ storeId, onChanged }) {
  const { data, reload } = useAsync(() => api.pricing.getRule(storeId), [storeId]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const r = form ?? (data
    ? { enabled: data.enabled, strategy: data.strategy, adjustValue: data.adjustValue, adjustIsPercent: data.adjustIsPercent, minMarginPercent: data.minMarginPercent, roundTo99: data.roundTo99 }
    : null);

  async function save() {
    setSaving(true);
    try {
      await api.pricing.setRule({
        storeId,
        ...r,
        adjustValue: Number(r.adjustValue),
        minMarginPercent: Number(r.minMarginPercent),
      });
      reload();
      onChanged?.();
    } finally {
      setSaving(false);
    }
  }
  if (!r) return null;
  return (
    <Card>
      <CardHeader title="Repricing rule" subtitle="How recommended prices are computed (always above the margin floor)." />
      <div className="space-y-4 p-5">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={r.enabled} onChange={(e) => setForm({ ...r, enabled: e.target.checked })} />
          Enable automatic repricing
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Strategy">
            <Select value={r.strategy} onChange={(e) => setForm({ ...r, strategy: e.target.value })}>
              <option value="BEAT_LOWEST">Beat the lowest competitor</option>
              <option value="MATCH_LOWEST">Match the lowest competitor</option>
              <option value="FIXED_MARGIN">Target a fixed margin</option>
            </Select>
          </Field>
          <Field label={r.strategy === 'FIXED_MARGIN' ? 'Target margin %' : 'Undercut by'}>
            <div className="flex items-center gap-2">
              <Input type="number" min="0" value={r.adjustValue} onChange={(e) => setForm({ ...r, adjustValue: e.target.value })} />
              {r.strategy === 'BEAT_LOWEST' && (
                <Select value={r.adjustIsPercent ? 'pct' : 'abs'} onChange={(e) => setForm({ ...r, adjustIsPercent: e.target.value === 'pct' })} className="w-20">
                  <option value="pct">%</option>
                  <option value="abs">₹p</option>
                </Select>
              )}
            </div>
          </Field>
          <Field label="Minimum margin floor (%)">
            <Input type="number" min="0" max="99" value={r.minMarginPercent} onChange={(e) => setForm({ ...r, minMarginPercent: e.target.value })} />
          </Field>
          <Field label="Charm pricing">
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={r.roundTo99} onChange={(e) => setForm({ ...r, roundTo99: e.target.checked })} />
              End prices in .99
            </label>
          </Field>
        </div>
        <div className="flex justify-end"><Button onClick={save} loading={saving}>Save rule</Button></div>
      </div>
    </Card>
  );
}

function CompetitorEditor({ item, onChanged }) {
  const [open, setOpen] = useState(false);
  const { data: comps, reload } = useAsync(() => (open ? api.pricing.listCompetitors(item.variantId) : Promise.resolve(null)), [open]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState(item.costMinor ? (item.costMinor / 100).toString() : '');

  async function add() {
    if (!name || !price) return;
    await api.pricing.addCompetitor({ variantId: item.variantId, competitorName: name, priceMinor: Math.round(Number(price) * 100) });
    setName(''); setPrice(''); reload(); onChanged?.();
  }
  async function saveCost() {
    await api.pricing.setCost(item.variantId, Math.round(Number(cost || 0) * 100));
    onChanged?.();
  }
  async function remove(id) {
    await api.pricing.removeCompetitor(id);
    reload(); onChanged?.();
  }

  return (
    <>
      <button onClick={() => setOpen((o) => !o)} className="text-xs text-indigo-600 hover:underline">{open ? 'Close' : 'Edit'}</button>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-end gap-2">
            <Field label="Unit cost (₹)"><Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} className="w-28" /></Field>
            <Button variant="secondary" onClick={saveCost}>Save cost</Button>
          </div>
          <div className="text-xs font-medium text-slate-500">Competitor prices</div>
          {comps?.map((c) => (
            <div key={c.id} className="flex items-center justify-between text-xs text-slate-600">
              <span>{c.competitorName} — {formatMoney(c.priceMinor, item.currency)}</span>
              <button onClick={() => remove(c.id)} className="text-rose-600"><Trash2 size={12} /></button>
            </div>
          ))}
          <div className="flex items-end gap-2">
            <Field label="Competitor"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="RivalShop" /></Field>
            <Field label="Price (₹)"><Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="w-28" /></Field>
            <Button variant="secondary" onClick={add}><Plus size={13} /> Add</Button>
          </div>
        </div>
      )}
    </>
  );
}

export default function Pricing() {
  const { selectedId } = useStores();
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const { data, loading, error, reload } = useAsync(
    () => (selectedId ? api.pricing.analyze(selectedId) : Promise.resolve(null)),
    [selectedId, tick],
  );

  async function act(fn) {
    setBusy(true);
    try { await fn(); reload(); } finally { setBusy(false); }
  }

  if (!selectedId) {
    return (
      <Card>
        <EmptyState icon={TrendingDown} title="Select a store">Choose a store to analyze pricing.</EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Pricing intelligence</h1>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => act(() => api.pricing.refresh(selectedId))}><RefreshCw size={14} /> Refresh competitors</Button>
          <Button disabled={busy} onClick={() => act(() => api.pricing.reprice(selectedId, true))}><Wand2 size={14} /> Reprice all</Button>
        </div>
      </div>

      <RuleCard storeId={selectedId} onChanged={refresh} />

      <Card>
        <CardHeader
          title="Margin & competitor analysis"
          subtitle={data ? `${data.summary.tracked}/${data.summary.variants} tracked · ${data.summary.cheapest} cheapest · ${data.summary.belowMargin} below margin · ${data.summary.repriceable} repriceable` : 'Per-variant pricing'}
        />
        {loading ? (
          <Spinner />
        ) : error ? (
          <div className="p-5"><ErrorBanner message={error} /></div>
        ) : data?.items.length === 0 ? (
          <EmptyState icon={TrendingDown} title="No active variants" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-5 py-3 font-medium">Product</th>
                <th className="px-5 py-3 font-medium">Price</th>
                <th className="px-5 py-3 font-medium">Margin</th>
                <th className="px-5 py-3 font-medium">Lowest rival</th>
                <th className="px-5 py-3 font-medium">Position</th>
                <th className="px-5 py-3 font-medium">Recommended</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {data?.items.map((i) => (
                <tr key={i.variantId} className="border-b border-slate-50 align-top last:border-0">
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-900">{i.productTitle}</div>
                    <div className="text-xs text-slate-400">{i.competitors} competitor(s)</div>
                  </td>
                  <td className="px-5 py-3 text-slate-700">{formatMoney(i.priceMinor, i.currency)}</td>
                  <td className="px-5 py-3">
                    {i.marginPercent === null ? <span className="text-slate-300">set cost</span> : (
                      <span className={i.marginPercent < (data.rule.minMarginPercent ?? 0) ? 'text-rose-600' : 'text-slate-600'}>{i.marginPercent}%</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{i.lowestCompetitorMinor ? formatMoney(i.lowestCompetitorMinor, i.currency) : '—'}</td>
                  <td className="px-5 py-3"><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${POSITION_BADGE[i.position]}`}>{i.position}</span></td>
                  <td className="px-5 py-3">
                    <span className="font-medium text-slate-900">{formatMoney(i.recommendedPriceMinor, i.currency)}</span>
                    {i.changeMinor !== 0 && (
                      <span className={`ml-1 text-xs ${i.changeMinor < 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                        ({i.changeMinor < 0 ? '' : '+'}{formatMoney(i.changeMinor, i.currency)})
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right"><CompetitorEditor item={i} onChanged={refresh} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
