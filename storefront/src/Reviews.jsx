import { useEffect, useState } from 'react';
import { api, STORE_ID } from './api';
import Stars from './Stars';

export default function Reviews({ productId }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ rating: 5, authorName: '', title: '', body: '', orderNumber: '', orderEmail: '' });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  function load() {
    api.productReviews(STORE_ID, productId).then(setData).catch(() => setData({ summary: { average: 0, count: 0 }, reviews: [] }));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [productId]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.submitReview(STORE_ID, productId, {
        rating: form.rating,
        authorName: form.authorName,
        title: form.title || undefined,
        body: form.body || undefined,
        orderNumber: form.orderNumber ? Number(form.orderNumber) : undefined,
        orderEmail: form.orderEmail || undefined,
      });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!data) return null;

  return (
    <div className="mx-auto mt-6 max-w-2xl rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold text-stone-900">Reviews</h2>
        <Stars value={data.summary.average} />
        <span className="text-sm text-stone-500">
          {data.summary.count ? `${data.summary.average} · ${data.summary.count} review${data.summary.count > 1 ? 's' : ''}` : 'No reviews yet'}
        </span>
      </div>

      <div className="mt-4 space-y-4">
        {data.reviews.map((r) => (
          <div key={r.id} className="border-t border-stone-100 pt-4">
            <div className="flex items-center gap-2">
              <Stars value={r.rating} size={14} />
              <span className="text-sm font-medium text-stone-800">{r.authorName}</span>
              {r.verified && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">Verified purchase</span>}
            </div>
            {r.title && <div className="mt-1 text-sm font-medium text-stone-900">{r.title}</div>}
            {r.body && <p className="mt-0.5 text-sm text-stone-600">{r.body}</p>}
            {r.merchantReply && (
              <div className="mt-2 rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-600">
                <span className="font-medium">Store reply:</span> {r.merchantReply}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 border-t border-stone-100 pt-5">
        {done ? (
          <p className="text-sm text-emerald-700">Thanks! Your review was submitted and will appear once approved.</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="text-sm font-medium text-stone-900">Write a review</div>
            <Stars value={form.rating} size={22} onChange={(rating) => setForm({ ...form, rating })} />
            <input
              required
              value={form.authorName}
              onChange={(e) => setForm({ ...form, authorName: e.target.value })}
              placeholder="Your name"
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Title (optional)"
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Your review"
              rows={3}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={form.orderNumber}
                onChange={(e) => setForm({ ...form, orderNumber: e.target.value })}
                placeholder="Order # (for verified badge)"
                className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
              />
              <input
                value={form.orderEmail}
                onChange={(e) => setForm({ ...form, orderEmail: e.target.value })}
                placeholder="Order email"
                className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
              />
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button
              disabled={submitting || !form.authorName.trim()}
              className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Submit review
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
