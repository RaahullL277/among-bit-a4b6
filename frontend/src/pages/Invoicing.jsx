import { useState } from 'react';
import { FileText, Download } from 'lucide-react';
import { api } from '../api/client';
import { useStores } from '../context/StoreContext';
import { useAsync } from '../hooks/useAsync';
import {
  Card,
  CardHeader,
  Spinner,
  ErrorBanner,
  Badge,
  EmptyState,
  Button,
  Field,
  Input,
  formatMoney,
} from '../components/ui';

export default function Invoicing() {
  const { selectedId, selectedStore } = useStores();
  const [tab, setTab] = useState('invoices');

  if (!selectedId) {
    return (
      <Card>
        <EmptyState icon={FileText} title="Select a store">
          Choose a store from the switcher above to view its GST invoices and accounts.
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-slate-900">Invoicing &amp; accounting</h1>

      <TaxIdentity storeId={selectedId} />

      <div className="flex gap-2">
        {[
          ['invoices', 'Tax invoices'],
          ['register', 'Sales register'],
          ['pnl', 'P&L (lite)'],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === k ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'invoices' && <Invoices storeId={selectedId} storeName={selectedStore?.name} />}
      {tab === 'register' && <SalesRegister storeId={selectedId} />}
      {tab === 'pnl' && <ProfitAndLoss storeId={selectedId} />}
    </div>
  );
}

// --- Seller tax identity (item 1) ------------------------------------------
function TaxIdentity({ storeId }) {
  const { data, loading, reload } = useAsync(() => api.stores.getTaxIdentity(storeId), [storeId]);
  const [form, setForm] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  if (loading || !data) return null;
  const p = form ?? data;
  const set = (k, v) => { setForm({ ...p, [k]: v }); setSaved(false); };
  async function save() {
    setBusy(true); setError('');
    try {
      await api.stores.setTaxIdentity(storeId, {
        legalName: p.legalName || null,
        gstin: p.gstin || null,
        pan: p.pan || null,
        taxAddressLine1: p.taxAddressLine1 || null,
        taxAddressLine2: p.taxAddressLine2 || null,
        taxCity: p.taxCity || null,
        taxState: p.taxState || null,
        taxPincode: p.taxPincode || null,
        invoicePrefix: p.invoicePrefix || undefined,
        creditNotePrefix: p.creditNotePrefix || undefined,
      });
      setForm(null); setSaved(true); reload();
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-5 py-4 text-left">
        <div>
          <div className="text-sm font-semibold text-slate-900">Seller tax identity</div>
          <div className="text-xs text-slate-400">
            {data.gstin ? `GSTIN ${data.gstin}` : 'No GSTIN — invoices issued as a plain bill'} ·
            {data.legalName ? ` ${data.legalName}` : ' legal name not set'}
          </div>
        </div>
        <span className="text-xs text-indigo-600">{open ? 'Hide' : 'Edit'}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 p-5">
          <ErrorBanner message={error} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Registered legal name"><Input value={p.legalName ?? ''} onChange={(e) => set('legalName', e.target.value)} placeholder="Acme Trading Pvt Ltd" /></Field>
            <Field label="GSTIN" hint="15 chars; state is derived from it"><Input value={p.gstin ?? ''} onChange={(e) => set('gstin', e.target.value.toUpperCase())} placeholder="29ABCDE1234F1Z5" /></Field>
            <Field label="PAN"><Input value={p.pan ?? ''} onChange={(e) => set('pan', e.target.value.toUpperCase())} placeholder="ABCDE1234F" /></Field>
            <Field label="Address line 1"><Input value={p.taxAddressLine1 ?? ''} onChange={(e) => set('taxAddressLine1', e.target.value)} /></Field>
            <Field label="Address line 2"><Input value={p.taxAddressLine2 ?? ''} onChange={(e) => set('taxAddressLine2', e.target.value)} /></Field>
            <Field label="City"><Input value={p.taxCity ?? ''} onChange={(e) => set('taxCity', e.target.value)} /></Field>
            <Field label="State" hint="Name or 2-digit code"><Input value={p.taxState ?? ''} onChange={(e) => set('taxState', e.target.value)} placeholder="Karnataka" /></Field>
            <Field label="PIN code"><Input value={p.taxPincode ?? ''} onChange={(e) => set('taxPincode', e.target.value)} /></Field>
            <div />
            <Field label="Invoice prefix"><Input value={p.invoicePrefix ?? 'INV'} onChange={(e) => set('invoicePrefix', e.target.value)} /></Field>
            <Field label="Credit-note prefix"><Input value={p.creditNotePrefix ?? 'CN'} onChange={(e) => set('creditNotePrefix', e.target.value)} /></Field>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={save} loading={busy} disabled={!form}>Save</Button>
            {saved && <span className="text-sm text-emerald-600">Saved.</span>}
          </div>
        </div>
      )}
    </Card>
  );
}

// --- Tax invoices (item 2) --------------------------------------------------
function Invoices({ storeId, storeName }) {
  const { data, loading, error } = useAsync(() => api.invoices.list(storeId), [storeId]);
  return (
    <Card>
      <CardHeader title={storeName} subtitle="GST tax invoices — one per paid order" />
      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="p-5"><ErrorBanner message={error} /></div>
      ) : !data?.length ? (
        <EmptyState icon={FileText} title="No invoices yet">
          A tax invoice is generated automatically when an order is paid.
        </EmptyState>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
              <th className="px-5 py-3 font-medium">Invoice</th>
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Buyer</th>
              <th className="px-5 py-3 font-medium">Place of supply</th>
              <th className="px-5 py-3 font-medium">Tax</th>
              <th className="px-5 py-3 font-medium">Total</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {data.map((inv) => (
              <tr key={inv.id} className="border-b border-slate-50 last:border-0">
                <td className="px-5 py-3 font-medium text-slate-900">
                  {inv.invoiceNo}
                  {!inv.isTaxInvoice && <span className="ml-2 text-xs text-slate-400">(bill)</span>}
                </td>
                <td className="px-5 py-3 text-slate-500">{new Date(inv.issuedAt).toLocaleDateString('en-IN')}</td>
                <td className="px-5 py-3 text-slate-600">
                  {inv.buyerName ?? '—'}
                  {inv.buyerGstin && <Badge>B2B</Badge>}
                </td>
                <td className="px-5 py-3 text-slate-500">
                  {inv.placeOfSupply ?? '—'}
                  <span className="ml-1 text-xs text-slate-400">{inv.intraState ? 'CGST+SGST' : 'IGST'}</span>
                </td>
                <td className="px-5 py-3 text-slate-600">{formatMoney(inv.taxMinor, inv.currency)}</td>
                <td className="px-5 py-3 font-medium text-slate-800">{formatMoney(inv.totalMinor, inv.currency)}</td>
                <td className="px-5 py-3">
                  <button onClick={() => api.invoices.openHtml(inv.id)} className="text-xs font-medium text-indigo-600 hover:underline">
                    View / print
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

// --- Sales register (item 4) ------------------------------------------------
function SalesRegister({ storeId }) {
  const [range, setRange] = useState({ from: '', to: '' });
  const { data, loading, error } = useAsync(
    () => api.accounting.salesRegister(storeId, range.from || undefined, range.to || undefined),
    [storeId, range.from, range.to],
  );
  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 p-5">
        <div className="flex gap-3">
          <Field label="From"><Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
          <Field label="To"><Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
        </div>
        <Button variant="secondary" onClick={() => api.accounting.downloadCsv(storeId, range.from || undefined, range.to || undefined)}>
          <Download size={14} className="mr-1 inline" /> Export CSV
        </Button>
      </div>
      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="p-5"><ErrorBanner message={error} /></div>
      ) : !data?.rows?.length ? (
        <EmptyState icon={FileText} title="Nothing in this period" />
      ) : (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-5 py-3 font-medium">Document</th>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Supply</th>
                <th className="px-5 py-3 font-medium">Taxable</th>
                <th className="px-5 py-3 font-medium">CGST</th>
                <th className="px-5 py-3 font-medium">SGST</th>
                <th className="px-5 py-3 font-medium">IGST</th>
                <th className="px-5 py-3 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-3 font-medium text-slate-900">
                    {r.documentNo}
                    {r.type === 'CREDIT_NOTE' && <span className="ml-2 text-xs text-rose-500">credit</span>}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{new Date(r.date).toLocaleDateString('en-IN')}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{r.intraState ? 'Intra' : 'Inter'}</td>
                  <td className="px-5 py-3 text-slate-600">{formatMoney(r.taxableMinor, r.currency)}</td>
                  <td className="px-5 py-3 text-slate-500">{formatMoney(r.cgstMinor, r.currency)}</td>
                  <td className="px-5 py-3 text-slate-500">{formatMoney(r.sgstMinor, r.currency)}</td>
                  <td className="px-5 py-3 text-slate-500">{formatMoney(r.igstMinor, r.currency)}</td>
                  <td className="px-5 py-3 font-medium text-slate-800">{formatMoney(r.totalMinor, r.currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 font-semibold text-slate-900">
                <td className="px-5 py-3" colSpan={3}>Totals · {data.invoiceCount} invoices · {data.creditNoteCount} credit notes</td>
                <td className="px-5 py-3">{formatMoney(data.totals.taxableMinor)}</td>
                <td className="px-5 py-3">{formatMoney(data.totals.cgstMinor)}</td>
                <td className="px-5 py-3">{formatMoney(data.totals.sgstMinor)}</td>
                <td className="px-5 py-3">{formatMoney(data.totals.igstMinor)}</td>
                <td className="px-5 py-3">{formatMoney(data.totals.totalMinor)}</td>
              </tr>
            </tfoot>
          </table>
        </>
      )}
    </Card>
  );
}

// --- P&L-lite (item 4) ------------------------------------------------------
function ProfitAndLoss({ storeId }) {
  const [range, setRange] = useState({ from: '', to: '' });
  const { data, loading, error } = useAsync(
    () => api.accounting.pnl(storeId, range.from || undefined, range.to || undefined),
    [storeId, range.from, range.to],
  );
  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-5">
        <Field label="From"><Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
        <Field label="To"><Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
      </div>
      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="p-5"><ErrorBanner message={error} /></div>
      ) : (
        <div className="p-5">
          <dl className="divide-y divide-slate-100">
            <Line label="Gross revenue (ex-tax)" value={formatMoney(data.grossRevenueMinor)} />
            <Line label="Less: refunds" value={`-${formatMoney(data.refundsMinor)}`} />
            <Line label="Net revenue" value={formatMoney(data.netRevenueMinor)} bold />
            <Line label="Less: COGS" value={`-${formatMoney(data.cogsMinor)}`} />
            <Line label="Gross profit" value={`${formatMoney(data.grossProfitMinor)} (${data.grossMarginPercent}%)`} bold />
            <Line label="GST collected (net)" value={formatMoney(data.taxCollectedMinor)} muted />
          </dl>
          <p className="mt-4 text-xs text-slate-400">{data.note}</p>
        </div>
      )}
    </Card>
  );
}

function Line({ label, value, bold, muted }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className={`text-sm ${muted ? 'text-slate-400' : 'text-slate-600'}`}>{label}</dt>
      <dd className={`text-sm ${bold ? 'font-semibold text-slate-900' : muted ? 'text-slate-400' : 'text-slate-700'}`}>{value}</dd>
    </div>
  );
}
