import { Star } from 'lucide-react';

/** Read-only or interactive star rating. */
export default function Stars({ value = 0, size = 16, onChange }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(value);
        const star = (
          <Star
            size={size}
            className={filled ? 'fill-amber-400 text-amber-400' : 'text-stone-300'}
          />
        );
        return onChange ? (
          <button key={n} type="button" onClick={() => onChange(n)} className="px-0.5" aria-label={`${n} star`}>
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </span>
  );
}
