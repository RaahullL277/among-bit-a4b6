import { useRef, useState } from 'react';
import { Sparkles, Paperclip, ImageIcon, X, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { api, readAssets, ADMIN_URL, PARTNER_URL } from '../api';

/**
 * The "start building your store" bar shared by both landing pages: a prompt
 * textarea, email, and image/file import (drag-drop or picker, with previews).
 * Submitting captures a lead via POST /leads/store-build, then offers a
 * "continue setup" link that carries the email + prompt into signup.
 */
export default function BuilderBar({ source, placeholder, cta }) {
  const isPartner = source === 'PARTNER';
  const [prompt, setPrompt] = useState('');
  const [email, setEmail] = useState('');
  const [assets, setAssets] = useState([]); // [{ name, type, size, dataUrl? }]
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null); // server response
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  async function addFiles(fileList) {
    if (!fileList?.length) return;
    const read = await readAssets(fileList);
    setAssets((cur) => [...cur, ...read].slice(0, 12));
  }

  function removeAsset(i) {
    setAssets((cur) => cur.filter((_, idx) => idx !== i));
  }

  async function submit(e) {
    e?.preventDefault();
    setError('');
    if (prompt.trim().length < 3) { setError('Tell us a little about your store first.'); return; }
    if (!email.includes('@')) { setError('Add an email so we can save your progress.'); return; }
    setBusy(true);
    try {
      const res = await api.submitBuild({
        source,
        email: email.trim(),
        prompt: prompt.trim(),
        assets,
        referrer: typeof window !== 'undefined' ? window.location.host : undefined,
      });
      setDone(res);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const base = isPartner ? PARTNER_URL : ADMIN_URL;
    const continueUrl = `${base}?intent=build&email=${encodeURIComponent(email.trim())}&prompt=${encodeURIComponent(prompt.trim())}`;
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 text-left shadow-sm">
        <div className="flex items-center gap-2 text-emerald-700">
          <CheckCircle2 size={22} />
          <h3 className="text-lg font-semibold">You’re on your way!</h3>
        </div>
        <p className="mt-2 text-sm text-emerald-800">{done.next?.message}</p>
        <p className="mt-1 text-xs text-emerald-700/80">
          Brief saved{done.assetCount ? ` with ${done.assetCount} file${done.assetCount === 1 ? '' : 's'}` : ''} · ref {done.id.slice(0, 8)}
        </p>
        <a
          href={continueUrl}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white hover:bg-emerald-700"
        >
          Continue setup <ArrowRight size={16} />
        </a>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
      className={`rounded-2xl border bg-white p-4 text-left shadow-xl shadow-indigo-100 transition ${dragOver ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-stone-200'}`}
    >
      <div className="flex items-start gap-2">
        <Sparkles size={18} className="mt-2 shrink-0 text-indigo-500" />
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="w-full resize-none bg-transparent py-1.5 text-[15px] outline-none placeholder:text-stone-400"
        />
      </div>

      {/* Imported file previews */}
      {assets.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {assets.map((a, i) => (
            <div key={i} className="group relative flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 py-1 pl-1 pr-2 text-xs text-stone-600">
              {a.dataUrl ? (
                <img src={a.dataUrl} alt={a.name} className="h-7 w-7 rounded object-cover" />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded bg-stone-200 text-stone-500"><ImageIcon size={14} /></span>
              )}
              <span className="max-w-[120px] truncate">{a.name}</span>
              <button type="button" onClick={() => removeAsset(i)} className="text-stone-400 hover:text-rose-500" aria-label="Remove file"><X size={13} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2 border-t border-stone-100 pt-3 sm:flex-row sm:items-center">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-indigo-300 sm:w-56"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-stone-200 px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50"
        >
          <Paperclip size={15} /> Import images & files
        </button>
        <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.csv,.xlsx,.txt" className="hidden" onChange={(e) => addFiles(e.target.files)} />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {busy ? 'Building…' : cta}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      <p className="mt-2 text-xs text-stone-400">Drag & drop your logo, product photos, or a catalog file. No credit card required.</p>
    </form>
  );
}
