/**
 * Provider-agnostic market-trends interface: "what's trending in this category /
 * segment / region". Real sources (Google Trends, a marketplace bestseller feed,
 * a market-research API) slot in behind this — each needs credentials + outbound
 * network access. Until one is configured, the StubMarketTrendsAdapter returns
 * deterministic SAMPLE data (clearly flagged) derived from the keywords passed
 * in, so the full surface is demonstrable offline.
 */

export interface MarketTrendQuery {
  category?: string;
  segment?: string;
  region?: string;
  /** Seed terms to read trends for — e.g. the store's product types + hot searches. */
  keywords?: string[];
}

export interface MarketTrend {
  term: string;
  direction: 'rising' | 'steady' | 'declining';
  /** Signed % change in interest vs the prior period. */
  changePercent: number;
  /** Relative search interest, 0..100. */
  interest: number;
}

export interface MarketTrendReport {
  source: string;        // 'sample' | 'google-trends' | …
  /** true → illustrative placeholder, NOT live market data. */
  sample: boolean;
  category?: string;
  region: string;
  generatedAt: string;
  note?: string;
  trends: MarketTrend[];
}

export interface MarketTrendsProvider {
  readonly source: string;
  categoryTrends(query: MarketTrendQuery): Promise<MarketTrendReport>;
}

// Stable 0..1 pseudo-random from a string (FNV-1a) — keeps the stub deterministic.
function seeded(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 2 ** 32;
}

/**
 * Deterministic sample provider. Reads "trends" over the supplied keywords (or a
 * generic fallback) so the output is grounded in the store's own vocabulary, but
 * every report is flagged `sample: true` so the UI never presents it as real.
 */
export class StubMarketTrendsAdapter implements MarketTrendsProvider {
  readonly source = 'sample';

  async categoryTrends(query: MarketTrendQuery): Promise<MarketTrendReport> {
    const region = query.region || 'IN';
    const terms = (query.keywords?.length ? query.keywords : [query.category ?? 'bestsellers', 'gifting', 'premium', 'budget'])
      .map((t) => String(t).toLowerCase().trim())
      .filter(Boolean)
      .slice(0, 12);

    const trends: MarketTrend[] = terms.map((term) => {
      const c = Math.round((seeded(`${term}|${region}|change`) - 0.4) * 120); // ~ -48..+72
      const interest = Math.round(30 + seeded(`${term}|${region}|interest`) * 70);
      const direction: MarketTrend['direction'] = c > 8 ? 'rising' : c < -8 ? 'declining' : 'steady';
      return { term, direction, changePercent: c, interest };
    });
    trends.sort((a, b) => b.changePercent - a.changePercent || b.interest - a.interest);

    return {
      source: this.source,
      sample: true,
      category: query.category,
      region,
      generatedAt: new Date().toISOString(),
      note: 'Sample data — connect a market-trends provider (e.g. Google Trends) for live category insights.',
      trends,
    };
  }
}

/**
 * Placeholder for a real provider. Wiring a live source means implementing this
 * against the provider's API (key from IntegrationConfig) + allowing egress.
 */
export class HttpMarketTrendsAdapter implements MarketTrendsProvider {
  readonly source: string;
  constructor(source = 'http') {
    this.source = source;
  }
  async categoryTrends(_query: MarketTrendQuery): Promise<MarketTrendReport> {
    throw new Error('No live market-trends provider is configured.');
  }
}
