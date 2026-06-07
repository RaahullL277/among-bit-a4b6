// Lightweight loading placeholders (pulse) used while data loads.

export function SkeletonCard() {
  return (
    <div className="flex flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-3 h-40 animate-pulse rounded-xl bg-stone-100" />
      <div className="h-4 w-3/4 animate-pulse rounded bg-stone-100" />
      <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-stone-100" />
      <div className="mt-4 flex items-center justify-between">
        <div className="h-4 w-16 animate-pulse rounded bg-stone-100" />
        <div className="h-8 w-20 animate-pulse rounded-lg bg-stone-100" />
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 6 }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
