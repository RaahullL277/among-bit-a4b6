import { Link } from 'react-router-dom';
import { money } from './api';
import { useCart } from './cart';

// A storefront product card used by product_grid / featured_product sections.
function ProductCard({ p }) {
  const { addToCart } = useCart();
  const v = p.variant;
  return (
    <div className="flex flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <Link to={`/product/${p.id}`} className="flex-1">
        <div className="mb-3 flex h-32 items-center justify-center rounded-xl bg-stone-100 text-3xl">🛍️</div>
        <div className="font-medium text-stone-900">{p.title}</div>
        {p.description && <div className="mt-1 line-clamp-2 text-sm text-stone-500">{p.description}</div>}
      </Link>
      <div className="mt-4 flex items-center justify-between">
        <span className="font-semibold text-stone-900">{v ? money(v.priceMinor, v.currency) : '—'}</span>
        {v && (
          <button
            onClick={() => addToCart(v.id, 1)}
            className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            Add to cart
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ section }) {
  const { type, data = {} } = section;
  switch (type) {
    case 'hero':
      return (
        <section className="overflow-hidden rounded-3xl bg-stone-900 px-8 py-16 text-center text-white">
          {data.heading && <h1 className="text-3xl font-bold sm:text-4xl">{data.heading}</h1>}
          {data.subheading && <p className="mx-auto mt-3 max-w-xl text-stone-300">{data.subheading}</p>}
          {data.ctaLabel && (
            <a
              href={data.ctaHref || '#'}
              className="mt-6 inline-block rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              {data.ctaLabel}
            </a>
          )}
        </section>
      );
    case 'rich_text':
      return (
        <section className="prose prose-stone mx-auto max-w-3xl">
          {data.title && <h2 className="text-2xl font-semibold text-stone-900">{data.title}</h2>}
          {data.body && <p className="mt-2 whitespace-pre-wrap text-stone-600">{data.body}</p>}
        </section>
      );
    case 'image':
      return (
        <section>
          {data.imageUrl ? (
            <img src={data.imageUrl} alt={data.alt || ''} className="w-full rounded-2xl object-cover" />
          ) : (
            <div className="flex h-48 items-center justify-center rounded-2xl bg-stone-100 text-stone-400">Image</div>
          )}
        </section>
      );
    case 'product_grid':
      return (
        <section>
          {data.title && <h2 className="mb-4 text-xl font-semibold text-stone-900">{data.title}</h2>}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(section.products ?? []).map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
          {(section.products ?? []).length === 0 && <p className="text-stone-400">No products to show.</p>}
        </section>
      );
    case 'featured_product':
      return section.product ? (
        <section className="mx-auto max-w-sm">
          <ProductCard p={section.product} />
        </section>
      ) : null;
    case 'faq':
      return (
        <section className="mx-auto max-w-3xl">
          {data.title && <h2 className="mb-4 text-xl font-semibold text-stone-900">{data.title}</h2>}
          <div className="space-y-3">
            {(data.items ?? []).map((it, i) => (
              <div key={i} className="rounded-xl border border-stone-200 bg-white p-4">
                <div className="font-medium text-stone-900">{it.q}</div>
                <div className="mt-1 text-sm text-stone-600">{it.a}</div>
              </div>
            ))}
          </div>
        </section>
      );
    default:
      return null;
  }
}

/** Render a builder page (array of resolved sections) for the storefront. */
export default function PageRenderer({ page }) {
  return (
    <div className="space-y-12">
      {page.sections.map((s) => (
        <Section key={s.id} section={s} />
      ))}
    </div>
  );
}
