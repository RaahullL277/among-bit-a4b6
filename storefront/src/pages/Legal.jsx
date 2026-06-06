import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, STORE_ID } from '../api';

// Render a tiny subset of markdown (headings, bold, hr, paragraphs) so generated
// policies read well without pulling in a markdown dependency.
function renderMarkdown(md) {
  return md.split('\n').map((line, i) => {
    const l = line.trimEnd();
    if (l === '---') return <hr key={i} className="my-4 border-stone-200" />;
    if (l.startsWith('# ')) return <h1 key={i} className="mt-2 text-xl font-semibold text-stone-900">{inline(l.slice(2))}</h1>;
    if (l.startsWith('## ')) return <h2 key={i} className="mt-5 text-base font-semibold text-stone-900">{inline(l.slice(3))}</h2>;
    if (l.startsWith('- ')) return <li key={i} className="ml-5 list-disc text-stone-600">{inline(l.slice(2))}</li>;
    if (l === '') return <div key={i} className="h-2" />;
    return <p key={i} className="text-sm leading-relaxed text-stone-600">{inline(l)}</p>;
  });
}
function inline(text) {
  // Bold **x** → <strong>; italic _x_ → <em>.
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).filter(Boolean);
  return parts.map((p, i) => {
    if (p.startsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('_') && p.endsWith('_')) return <em key={i}>{p.slice(1, -1)}</em>;
    return p;
  });
}

export default function Legal() {
  const { type } = useParams();
  const [policies, setPolicies] = useState([]);
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.legalPolicies(STORE_ID).then(setPolicies).catch(() => setPolicies([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    if (type) {
      api.legalPolicy(STORE_ID, type).then(setDoc).catch(() => setDoc(null)).finally(() => setLoading(false));
    } else {
      setDoc(null);
      setLoading(false);
    }
  }, [type]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap gap-2">
        {policies.map((p) => (
          <Link
            key={p.type}
            to={`/legal/${p.slug}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${type === p.slug ? 'bg-stone-900 text-white' : 'border border-stone-300 text-stone-600 hover:bg-stone-50'}`}
          >
            {p.title}
          </Link>
        ))}
      </div>

      {loading ? (
        <p className="text-stone-400">Loading…</p>
      ) : !type ? (
        <p className="text-stone-500">Select a policy above.</p>
      ) : !doc ? (
        <p className="text-stone-500">This policy isn’t available.</p>
      ) : (
        <article className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          {renderMarkdown(doc.body)}
        </article>
      )}
    </div>
  );
}
