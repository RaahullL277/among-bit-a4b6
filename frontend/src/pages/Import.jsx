import { useState } from 'react';
import { DownloadCloud } from 'lucide-react';
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
  Select,
  Textarea,
} from '../components/ui';

const SOURCES = [
  ['SHOPIFY', 'Shopify (CSV export)'],
  ['WOOCOMMERCE', 'WooCommerce (CSV export)'],
  ['DUKAAN', 'Dukaan (CSV export)'],
  ['GENERIC', 'Generic CSV / JSON'],
];

export default function ImportPage() {
  const { selectedId, selectedStore } = useStores();
  const [mode, setMode] = useState('file'); // 'file' | 'api'
  const [source, setSource] = useState('SHOPIFY');
  const [kind, setKind] = useState('products');
  const [data, setData] = useState('');
  const [updateExisting, setUpdateExisting] = useState(false);
  const [creds, setCreds] = useState({ shop: '', accessToken: '', url: '', consumerKey: '', consumerSecret: '' });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const { data: jobs, reload } = useAsync(() => (selectedId ? api.imports.list(selectedId) : Promise.resolve([])), [selectedId]);

  if (!selectedId) {
    return (
      <Card>
        <EmptyState icon={DownloadCloud} title="Select a store">
          Choose the store you want to import into.
        </EmptyState>
      </Card>
    );
  }

  // API mode only supports Shopify/WooCommerce; force a valid source on switch.
  const apiSources = ['SHOPIFY', 'WOOCOMMERCE'];
  const effSource = mode === 'api' && !apiSources.includes(source) ? 'SHOPIFY' : source;

  async function run(dryRun) {
    setBusy(dryRun ? 'dry' : 'run'); setError(''); setResult(null);
    try {
      const job = mode === 'api'
        ? await api.imports.runApi({ storeId: selectedId, source: effSource, kind, credentials: creds, dryRun, updateExisting })
        : await api.imports.run({ storeId: selectedId, source, kind, data, dryRun, updateExisting });
      setResult(job);
      if (!dryRun) reload();
    } catch (e) {
      setError(e.message);
    } finally { setBusy(''); }
  }

  const canRun = mode === 'api'
    ? (effSource === 'SHOPIFY' ? creds.shop && creds.accessToken : creds.url && creds.consumerKey && creds.consumerSecret)
    : data.trim();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-slate-900">Import / migrate a store</h1>
      <p className="text-sm text-slate-500">
        Move products, customers, historical orders, or inventory from an existing store into <strong>{selectedStore?.name}</strong> — by pasting an export or connecting the source store's API. Re-running is safe: existing items (by title/SKU/email/order ref) are skipped.
      </p>

      <Card>
        <CardHeader title="New import" />
        <div className="space-y-4 p-5">
          <ErrorBanner message={error} />

          <div className="flex gap-2">
            {[['file', 'Paste export'], ['api', 'Connect API']].map(([m, l]) => (
              <button key={m} onClick={() => setMode(m)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${mode === m ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>{l}</button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Source platform">
              <Select value={effSource} onChange={(e) => setSource(e.target.value)}>
                {(mode === 'api' ? SOURCES.filter(([v]) => apiSources.includes(v)) : SOURCES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="What to import">
              <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="products">Products</option>
                <option value="customers">Customers</option>
                <option value="orders">Historical orders</option>
                {mode === 'file' && <option value="inventory">Inventory (stock sheet)</option>}
              </Select>
            </Field>
          </div>

          {mode === 'file' ? (
            <Field label="Export contents" hint="Paste the CSV (or JSON) exported from your current store">
              <Textarea rows={12} value={data} onChange={(e) => setData(e.target.value)} placeholder="Handle,Title,Body (HTML),...&#10;turmeric-200g,Turmeric 200g,..." className="font-mono text-xs" />
            </Field>
          ) : effSource === 'SHOPIFY' ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Shop domain" hint="mystore or mystore.myshopify.com"><Input value={creds.shop} onChange={(e) => setCreds({ ...creds, shop: e.target.value })} placeholder="mystore.myshopify.com" /></Field>
              <Field label="Admin API access token"><Input type="password" value={creds.accessToken} onChange={(e) => setCreds({ ...creds, accessToken: e.target.value })} placeholder="shpat_…" /></Field>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="Store URL"><Input value={creds.url} onChange={(e) => setCreds({ ...creds, url: e.target.value })} placeholder="https://store.example" /></Field>
              <Field label="Consumer key"><Input value={creds.consumerKey} onChange={(e) => setCreds({ ...creds, consumerKey: e.target.value })} placeholder="ck_…" /></Field>
              <Field label="Consumer secret"><Input type="password" value={creds.consumerSecret} onChange={(e) => setCreds({ ...creds, consumerSecret: e.target.value })} placeholder="cs_…" /></Field>
            </div>
          )}

          {kind === 'products' && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
              Update existing products (refresh price &amp; stock by SKU) instead of skipping
            </label>
          )}

          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={() => run(true)} loading={busy === 'dry'} disabled={!canRun}>Preview (dry run)</Button>
            <Button onClick={() => run(false)} loading={busy === 'run'} disabled={!canRun}>Import</Button>
          </div>
        </div>
      </Card>

      {result && <ResultCard job={result} />}

      <Card>
        <CardHeader title="Recent imports" />
        {!jobs?.length ? (
          <EmptyState icon={DownloadCloud} title="No imports yet" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-5 py-3 font-medium">Source</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Created</th>
                <th className="px-5 py-3 font-medium">Skipped</th>
                <th className="px-5 py-3 font-medium">Failed</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-3 text-slate-500">{new Date(j.createdAt).toLocaleString('en-IN')}</td>
                  <td className="px-5 py-3 text-slate-600">{j.source}{j.dryRun ? ' (preview)' : ''}</td>
                  <td className="px-5 py-3"><Badge>{j.status}</Badge></td>
                  <td className="px-5 py-3 text-emerald-600">{j.productsCreated + j.customersCreated}</td>
                  <td className="px-5 py-3 text-slate-500">{j.productsSkipped + j.customersSkipped}</td>
                  <td className="px-5 py-3 text-rose-600">{j.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function ResultCard({ job }) {
  const rows = Array.isArray(job.report) ? job.report : [];
  return (
    <Card>
      <CardHeader
        title={job.dryRun ? 'Preview result' : 'Import result'}
        subtitle={`${job.productsCreated + job.customersCreated} created · ${job.productsSkipped + job.customersSkipped} skipped · ${job.failed} failed`}
      />
      {job.error && <div className="p-5"><ErrorBanner message={job.error} /></div>}
      {rows.length > 0 && (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-2 text-slate-700">{r.name}</td>
                  <td className="px-5 py-2">
                    <span className={r.status === 'created' ? 'text-emerald-600' : r.status === 'skipped' ? 'text-slate-400' : 'text-rose-600'}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-5 py-2 text-xs text-slate-400">{r.reason ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
