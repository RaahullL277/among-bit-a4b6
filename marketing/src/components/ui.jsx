import { Star } from 'lucide-react';

export function Section({ id, className = '', children }) {
  return (
    <section id={id} className={`mx-auto w-full max-w-6xl px-5 py-16 sm:py-20 ${className}`}>
      {children}
    </section>
  );
}

export function Eyebrow({ children }) {
  return <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-indigo-600">{children}</div>;
}

export function Stars({ value = 5, size = 15 }) {
  return (
    <div className="flex items-center gap-0.5 text-amber-400">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={size} fill={i < value ? 'currentColor' : 'none'} className={i < value ? '' : 'text-stone-300'} />
      ))}
    </div>
  );
}

export function Badge({ children }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
      {children}
    </span>
  );
}
