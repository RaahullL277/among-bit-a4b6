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
  const [source, setSource] = useState('SHOPIFY');
  const [kind, setKind] = useState('products');
  const [data, setData] = useState('');
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

  async function run(dryRun) {
    setBusy(dryRun ? 'dry' : 'run'); setError(''); setResult(null);
    try {
      const job = await api.imports.run({ storeId: selectedId, source, kind, data, dryRun });
      setResult(job);
      if (!dryRun) reload();
    } catch (e) {
      setError(e.message);
    } finally { setBusy(''); }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-slate-900">Import / migrate a store</h1>
      <p className="text-sm text-slate-500">
        Move your catalog or customers from an existing store into <strong>{selectedStore?.name}</strong>. Export from your current platform, paste the file contents below, preview, then import. Re-running is safe — existing items (by title/SKU/email) are skipped.
      </p>

      <Card>
        <CardHeader title="New import" />
        <div className="space-y-4 p-5">
          <ErrorBanner message={error} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Source platform">
              <Select value={source} onChange={(e) => setSource(e.target.value)}>
                {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="What to import">
              <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="products">Products</option>
                <option value="customers">Customers</option>
              </Select>
            </Field>
          </div>
          <Field label="Export contents" hint="Paste the CSV (or JSON) exported from your current store">
            <Textarea rows={12} value={data} onChange={(e) => setData(e.target.value)} placeholder="Handle,Title,Body (HTML),...&#10;turmeric-200g,Turmeric 200g,..." className="font-mono text-xs" />
          </Field>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={() => run(true)} loading={busy === 'dry'} disabled={!data.trim()}>Preview (dry run)</Button>
            <Button onClick={() => run(false)} loading={busy === 'run'} disabled={!data.trim()}>Import</Button>
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
