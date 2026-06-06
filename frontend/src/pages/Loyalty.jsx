import { useState } from 'react';
import { Gift, Plus, Minus } from 'lucide-react';
import { api } from '../api/client';
import { useStores } from '../context/StoreContext';
import { useAsync } from '../hooks/useAsync';
import { Button, Card, CardHeader, Field, Input, Spinner, ErrorBanner, Badge, EmptyState } from '../components/ui';

function ProgramCard({ storeId }) {
  const { data, reload } = useAsync(() => api.loyalty.getProgram(storeId), [storeId]);
  const [form, setForm] = useState(null);
  const [tiersText, setTiersText] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const p = form ?? (data
    ? {
        enabled: data.enabled,
        pointsPerCurrencyUnit: data.pointsPerCurrencyUnit,
        redeemValueMinorPerPoint: data.redeemValueMinorPerPoint,
        minRedeemPoints: data.minRedeemPoints,
        signupBonus: data.signupBonus,
      }
    : null);
  const tiers = tiersText ?? (data ? (data.tiers ?? []).map((t) => `${t.name}:${t.minPoints}`).join(', ') : '');

  async function save() {
    setSaving(true);
    setError('');
    try {
      const parsedTiers = tiers
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const [name, minPoints] = s.split(':').map((x) => x.trim());
          return { name, minPoints: parseInt(minPoints, 10) || 0 };
        });
      await api.loyalty.setProgram({
        storeId,
        ...p,
        pointsPerCurrencyUnit: Number(p.pointsPerCurrencyUnit),
        redeemValueMinorPerPoint: Number(p.redeemValueMinorPerPoint),
        minRedeemPoints: Number(p.minRedeemPoints),
        signupBonus: Number(p.signupBonus),
        tiers: parsedTiers,
      });
      reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!p) return null;
  return (
    <Card>
      <CardHeader title="Program" subtitle="Points are awarded automatically on paid orders." />
      <div className="space-y-4 p-5">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={p.enabled} onChange={(e) => setForm({ ...p, enabled: e.target.checked })} />
          Loyalty program enabled
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Points per ₹1 spent">
            <Input type="number" min="0" value={p.pointsPerCurrencyUnit} onChange={(e) => setForm({ ...p, pointsPerCurrencyUnit: e.target.value })} />
          </Field>
          <Field label="Redemption value (paise / point)" hint="10 = ₹0.10 per point">
            <Input type="number" min="0" value={p.redeemValueMinorPerPoint} onChange={(e) => setForm({ ...p, redeemValueMinorPerPoint: e.target.value })} />
          </Field>
          <Field label="Minimum points to redeem">
            <Input type="number" min="0" value={p.minRedeemPoints} onChange={(e) => setForm({ ...p, minRedeemPoints: e.target.value })} />
          </Field>
          <Field label="Signup bonus (points)">
            <Input type="number" min="0" value={p.signupBonus} onChange={(e) => setForm({ ...p, signupBonus: e.target.value })} />
          </Field>
        </div>
        <Field label="Tiers" hint='Format: "Silver:300, Gold:1000" (name:lifetime-points)'>
          <Input value={tiers} onChange={(e) => setTiersText(e.target.value)} placeholder="Silver:300, Gold:1000" />
        </Field>
        {error && <ErrorBanner message={error} />}
        <div className="flex justify-end">
          <Button onClick={save} loading={saving}>Save program</Button>
        </div>
      </div>
    </Card>
  );
}

function AccountsCard({ storeId }) {
  const { data: accounts, loading, error, reload } = useAsync(() => api.loyalty.accounts(storeId), [storeId]);
  const [adjustFor, setAdjustFor] = useState(null);
  const [points, setPoints] = useState('');

  async function adjust(customerId, sign) {
    const n = parseInt(points, 10);
    if (!n) return;
    await api.loyalty.adjust(customerId, { points: sign * Math.abs(n), note: 'Manual adjustment' });
    setAdjustFor(null);
    setPoints('');
    reload();
  }

  return (
    <Card>
      <CardHeader title="Members" subtitle="Customer point balances and tiers." />
      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="p-5"><ErrorBanner message={error} /></div>
      ) : accounts?.length === 0 ? (
        <EmptyState icon={Gift} title="No members yet">Points accrue once customers buy with the program on.</EmptyState>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
              <th className="px-5 py-3 font-medium">Customer</th>
              <th className="px-5 py-3 font-medium">Tier</th>
              <th className="px-5 py-3 font-medium">Balance</th>
              <th className="px-5 py-3 font-medium">Lifetime</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {accounts?.map((a) => (
              <tr key={a.customerId} className="border-b border-slate-50 last:border-0">
                <td className="px-5 py-3">
                  <div className="font-medium text-slate-900">{a.name ?? '—'}</div>
                  <div className="text-xs text-slate-400">{a.email ?? ''}</div>
                </td>
                <td className="px-5 py-3">{a.tier ? <Badge>{a.tier}</Badge> : <span className="text-slate-300">—</span>}</td>
                <td className="px-5 py-3 font-medium text-slate-900">{a.pointsBalance}</td>
                <td className="px-5 py-3 text-slate-500">{a.lifetimePoints}</td>
                <td className="px-5 py-3 text-right">
                  {adjustFor === a.customerId ? (
                    <div className="flex items-center justify-end gap-1">
                      <Input value={points} onChange={(e) => setPoints(e.target.value)} placeholder="pts" className="w-20" />
                      <button onClick={() => adjust(a.customerId, 1)} className="rounded-lg bg-emerald-600 p-1.5 text-white" title="Add"><Plus size={13} /></button>
                      <button onClick={() => adjust(a.customerId, -1)} className="rounded-lg bg-rose-600 p-1.5 text-white" title="Remove"><Minus size={13} /></button>
                    </div>
                  ) : (
                    <button onClick={() => { setAdjustFor(a.customerId); setPoints(''); }} className="text-xs text-indigo-600 hover:underline">Adjust</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export default function Loyalty() {
  const { selectedId } = useStores();
  if (!selectedId) {
    return (
      <Card>
        <EmptyState icon={Gift} title="Select a store">Choose a store to manage its loyalty program.</EmptyState>
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-slate-900">Loyalty</h1>
      <ProgramCard storeId={selectedId} />
      <AccountsCard storeId={selectedId} />
    </div>
  );
}
