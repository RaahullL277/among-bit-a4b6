import {
  Sparkles, CreditCard, MessageCircle, Receipt, Truck, TrendingUp,
  LayoutDashboard, IndianRupee, Boxes, Repeat, ShieldCheck, Check, ArrowRight, Quote,
} from 'lucide-react';
import { Section, Eyebrow, Badge, Stars } from '../components/ui';
import BuilderBar from '../components/BuilderBar';
import ComparisonTable from '../components/ComparisonTable';
import Nav from '../components/Nav';
import Footer from '../components/Footer';

const ICONS = { Sparkles, CreditCard, MessageCircle, Receipt, Truck, TrendingUp, LayoutDashboard, IndianRupee, Boxes, Repeat, ShieldCheck };

export default function Landing({ content }) {
  const source = content.audience === 'partner' ? 'PARTNER' : 'MERCHANT';

  return (
    <div className="min-h-screen bg-white">
      <Nav content={content} />

      {/* Hero with the builder bar */}
      <div className="aurora border-b border-stone-100">
        <Section id="build" className="!py-20 text-center">
          <div className="mx-auto flex max-w-3xl flex-col items-center">
            <Badge><Sparkles size={13} /> {content.hero.badge}</Badge>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-stone-900 sm:text-5xl">
              {content.hero.title}
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-stone-600">{content.hero.subtitle}</p>
          </div>
          <div className="mx-auto mt-8 max-w-2xl">
            <BuilderBar source={source} placeholder={content.hero.builderPlaceholder} cta={content.hero.builderCta} />
          </div>
        </Section>
      </div>

      {/* Why us */}
      <Section id="why">
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <div>
            <Eyebrow>Why us</Eyebrow>
            <h2 className="text-3xl font-bold tracking-tight text-stone-900">{content.why.title}</h2>
            <p className="mt-4 text-stone-600">{content.why.body}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {content.why.points.map((p) => (
              <div key={p.title} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><Check size={16} /></div>
                <h3 className="mt-3 font-semibold text-stone-900">{p.title}</h3>
                <p className="mt-1 text-sm text-stone-500">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Benefits strip */}
      <div className="bg-stone-50">
        <Section className="!py-14">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {content.benefits.map((b) => (
              <div key={b.title}>
                <div className="flex items-center gap-2 font-semibold text-stone-900">
                  <ArrowRight size={16} className="text-indigo-500" /> {b.title}
                </div>
                <p className="mt-1.5 text-sm text-stone-500">{b.desc}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* Features */}
      <Section id="features">
        <div className="text-center">
          <Eyebrow>Features</Eyebrow>
          <h2 className="text-3xl font-bold tracking-tight text-stone-900">Everything to sell, included</h2>
          <p className="mx-auto mt-2 max-w-2xl text-stone-500">No app store to assemble — every capability works on day one.</p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {content.features.map((f) => {
            const Icon = ICONS[f.icon] ?? Sparkles;
            return (
              <div key={f.title} className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition hover:shadow-md">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-600"><Icon size={20} /></div>
                <h3 className="mt-4 font-semibold text-stone-900">{f.title}</h3>
                <p className="mt-1.5 text-sm text-stone-500">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Value / stats */}
      <div className="bg-stone-900 text-white">
        <Section className="!py-16 text-center">
          <Eyebrow>Value</Eyebrow>
          <h2 className="text-3xl font-bold tracking-tight">{content.value.title}</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-4">
            {content.value.stats.map((s) => (
              <div key={s.label}>
                <div className="text-4xl font-extrabold text-indigo-400">{s.value}</div>
                <div className="mt-1 text-sm text-stone-400">{s.label}</div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* Comparison (merchant only) */}
      {content.comparison && <ComparisonTable data={content.comparison} />}

      {/* Reviews */}
      <div className="bg-stone-50">
        <Section id="reviews">
          <div className="text-center">
            <Eyebrow>Reviews</Eyebrow>
            <h2 className="text-3xl font-bold tracking-tight text-stone-900">Loved by founders & partners</h2>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {content.reviews.map((r) => (
              <figure key={r.name} className="flex flex-col rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
                <Quote size={22} className="text-indigo-200" />
                <blockquote className="mt-3 flex-1 text-stone-700">“{r.quote}”</blockquote>
                <Stars value={r.rating} />
                <figcaption className="mt-3 text-sm">
                  <span className="font-semibold text-stone-900">{r.name}</span>
                  <span className="text-stone-500"> · {r.role}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </Section>
      </div>

      {/* Final CTA with the builder bar again */}
      <Section className="text-center">
        <div className="mx-auto max-w-3xl rounded-3xl border border-indigo-100 bg-gradient-to-b from-indigo-50/60 to-white p-8 sm:p-10">
          <h2 className="text-3xl font-bold tracking-tight text-stone-900">{content.finalCta.title}</h2>
          <p className="mx-auto mt-2 max-w-xl text-stone-600">{content.finalCta.subtitle}</p>
          <div className="mx-auto mt-7 max-w-2xl">
            <BuilderBar source={source} placeholder={content.hero.builderPlaceholder} cta={content.hero.builderCta} />
          </div>
        </div>
      </Section>

      <Footer content={content} />
    </div>
  );
}
