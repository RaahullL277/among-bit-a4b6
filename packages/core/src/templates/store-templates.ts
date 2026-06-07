import type { PageSection } from '../services/page.service.js';

export type StoreCategory = 'fashion' | 'lifestyle' | 'cosmetics' | 'jewellery' | 'kitchenware' | 'perfumes';

export interface StoreTemplate {
  id: string;
  category: StoreCategory;
  name: string;
  description: string;
  /** The customer segment this template is designed for (who it's for). */
  segment?: string;
  theme: { primaryColor: string; accentColor: string };
  /** Default hero subheading used when launching from this template. */
  tagline: string;
  /** Ordered storefront home-page sections (page-builder blocks). */
  sections: PageSection[];
}

// Per-template content; the section layout is composed by `build` below so the
// templates stay consistent while differing in palette, copy, FAQ, and the
// customer segment each one targets.
interface Spec {
  id: string;
  name: string;
  description: string;
  /** The shopper segment this template is tuned for. */
  segment?: string;
  primary: string;
  accent: string;
  heading: string;
  tagline: string;
  cta: string;
  storyTitle: string;
  storyBody: string;
  gridTitle: string;
}

// Category FAQ sets (shared across that category's templates).
const FAQ: Record<StoreCategory, { q: string; a: string }[]> = {
  fashion: [
    { q: 'How do I find my size?', a: 'Each product page has a detailed size chart. When in doubt, size up for a relaxed fit.' },
    { q: 'What is your return policy?', a: 'Free returns within 14 days on unworn items with tags attached.' },
    { q: 'How long does delivery take?', a: 'Orders ship in 1–2 business days; most metros receive within 3–5 days.' },
  ],
  lifestyle: [
    { q: 'What materials do you use?', a: 'We favour durable, responsibly sourced materials and list them on every product.' },
    { q: 'Do you offer easy returns?', a: 'Yes — 15-day hassle-free returns and exchanges on unused items.' },
    { q: 'How is my order shipped?', a: 'Carefully packed and dispatched within 2 days, with tracking sent to your email.' },
  ],
  cosmetics: [
    { q: 'Are your products cruelty-free?', a: 'Always. We never test on animals and call out vegan formulations on the label.' },
    { q: 'Where can I see ingredients?', a: 'Full ingredient lists are on every product page so you can shop with confidence.' },
    { q: 'Can I return opened products?', a: 'Unopened items can be returned within 14 days; reach out for any reaction concerns.' },
  ],
  jewellery: [
    { q: 'Is the jewellery authentic / hallmarked?', a: 'Every piece is quality-checked and hallmarked where applicable, with a certificate included.' },
    { q: 'How do I care for my piece?', a: 'Store dry, avoid perfume contact, and clean gently with a soft cloth.' },
    { q: 'What about returns & warranty?', a: '15-day returns on unworn pieces, plus a warranty against manufacturing defects.' },
  ],
  kitchenware: [
    { q: 'Is the cookware induction & gas compatible?', a: 'Compatibility is listed on every product — most pieces work on gas, induction, and ceramic hobs.' },
    { q: 'How do I clean and care for it?', a: 'Each item ships with care guidance; most are easy to hand-wash, and dishwasher-safe pieces are clearly marked.' },
    { q: 'What about warranty and returns?', a: '15-day returns on unused items in original packaging, plus a warranty against manufacturing defects.' },
  ],
  perfumes: [
    { q: 'How long does the scent last?', a: 'Longevity is noted per fragrance — eau de parfum lasts longest, while mists and colognes are lighter for daytime.' },
    { q: 'Are the fragrances long-lasting and safe for skin?', a: 'We share notes, concentration, and ingredients on every page; spray on pulse points and avoid broken skin.' },
    { q: 'Can I return an opened bottle?', a: 'Unopened bottles can be returned within 14 days. Try our discovery/sample sizes first to find your match.' },
  ],
};

function build(category: StoreCategory, s: Spec): StoreTemplate {
  const sections: PageSection[] = [
    { id: 'hero', type: 'hero', data: { heading: s.heading, subheading: s.tagline, ctaLabel: s.cta, ctaHref: '/' } },
    { id: 'story', type: 'rich_text', data: { title: s.storyTitle, body: s.storyBody } },
    { id: 'grid', type: 'product_grid', data: { title: s.gridTitle, mode: 'all', limit: 8 } },
    { id: 'faq', type: 'faq', data: { title: 'Good to know', items: FAQ[category] } },
  ];
  return {
    id: s.id,
    category,
    name: s.name,
    description: s.description,
    segment: s.segment,
    theme: { primaryColor: s.primary, accentColor: s.accent },
    tagline: s.tagline,
    sections,
  };
}

const FASHION: Spec[] = [
  { id: 'fashion-runway-minimal', name: 'Runway Minimal', description: 'Editorial black-and-camel minimalism for elevated essentials.', primary: '#111111', accent: '#C2A878', heading: 'Timeless, effortless.', tagline: 'Modern wardrobe staples, designed to last.', cta: 'Shop the edit', storyTitle: 'Considered design', storyBody: 'Quietly luxurious pieces in a refined palette — made to mix, layer, and wear for years.', gridTitle: 'New arrivals' },
  { id: 'fashion-street-edit', name: 'Street Edit', description: 'Bold, high-contrast streetwear energy.', primary: '#1A1A2E', accent: '#E94560', heading: 'Wear the statement.', tagline: 'Drops, graphics, and everyday street staples.', cta: 'Shop the drop', storyTitle: 'Built for the city', storyBody: 'Heavyweight fabrics and bold graphics for a look that stands out on any block.', gridTitle: 'Latest drop' },
  { id: 'fashion-boutique-luxe', name: 'Boutique Luxe', description: 'Soft rose-gold luxury for a premium boutique.', primary: '#2C2C2C', accent: '#B76E79', heading: 'Quietly luxurious.', tagline: 'Curated pieces for the discerning wardrobe.', cta: 'Explore the collection', storyTitle: 'Curated, not crowded', storyBody: 'A tightly edited selection of premium pieces, chosen for cut, fabric, and feel.', gridTitle: 'The collection' },
  { id: 'fashion-athleisure', name: 'Athleisure', description: 'Fresh, energetic look for activewear & athleisure.', primary: '#0F172A', accent: '#22D3EE', heading: 'Move better.', tagline: 'Performance fabrics that go from studio to street.', cta: 'Shop activewear', storyTitle: 'Engineered to move', storyBody: 'Breathable, four-way-stretch fabrics built for training and made for everyday.', gridTitle: 'Best sellers' },
  { id: 'fashion-vintage-denim', name: 'Vintage Denim', description: 'Indigo-and-mustard heritage denim vibe.', primary: '#1E3A5F', accent: '#D98E04', heading: 'Old-school, done right.', tagline: 'Honest denim and heritage staples.', cta: 'Shop denim', storyTitle: 'Made to fade', storyBody: 'Classic cuts in honest denim that only get better with every wear.', gridTitle: 'Denim & more' },
];

const LIFESTYLE: Spec[] = [
  { id: 'lifestyle-calm-neutral', name: 'Calm Neutral', description: 'Warm taupe-and-sage calm for home & wellness.', primary: '#5B5546', accent: '#8AA399', heading: 'Slow living, beautifully.', tagline: 'Everyday objects that bring a little calm.', cta: 'Shop the collection', storyTitle: 'Made for the everyday', storyBody: 'Thoughtful, durable goods in a soft natural palette — for a home that feels good.', gridTitle: 'Featured' },
  { id: 'lifestyle-coastal', name: 'Coastal', description: 'Navy-and-sand coastal lifestyle.', primary: '#1F3A5F', accent: '#E0C097', heading: 'Bring the coast home.', tagline: 'Breezy, sun-washed essentials for easy living.', cta: 'Shop coastal', storyTitle: 'Easy by the water', storyBody: 'Light textures and warm sand tones inspired by long days by the sea.', gridTitle: 'New in' },
  { id: 'lifestyle-botanical', name: 'Botanical', description: 'Forest-green botanical & plant lifestyle.', primary: '#2F3E2E', accent: '#A3B18A', heading: 'A little more green.', tagline: 'Plants, planters, and naturals for your space.', cta: 'Shop botanicals', storyTitle: 'Grow your space', storyBody: 'Bring the outdoors in with greenery and naturally made goods.', gridTitle: 'Shop the look' },
  { id: 'lifestyle-warm-minimal', name: 'Warm Minimal', description: 'Terracotta-accented warm minimalism.', primary: '#3A3A3A', accent: '#E07A5F', heading: 'Less, but warmer.', tagline: 'Simple, characterful pieces for modern homes.', cta: 'Shop home', storyTitle: 'Simple with soul', storyBody: 'Pared-back design with a warm terracotta touch — minimal, never cold.', gridTitle: 'Bestsellers' },
  { id: 'lifestyle-scandi-bright', name: 'Scandi Bright', description: 'Bright Scandinavian everyday goods.', primary: '#2B2D42', accent: '#F2CC8F', heading: 'Bright and functional.', tagline: 'Clean, cheerful design for daily life.', cta: 'Shop everyday', storyTitle: 'Function first', storyBody: 'Clean lines and a cheerful accent — design that works as hard as you do.', gridTitle: 'Popular now' },
];

const COSMETICS: Spec[] = [
  { id: 'cosmetics-clean-beauty', name: 'Clean Beauty', description: 'Blush-toned clean beauty & skincare.', primary: '#2E2A26', accent: '#E8B4B8', heading: 'Skin first.', tagline: 'Clean, effective formulas for everyday glow.', cta: 'Shop skincare', storyTitle: 'Honest formulas', storyBody: 'Transparent ingredients and gentle, effective care for healthy-looking skin.', gridTitle: 'Bestsellers' },
  { id: 'cosmetics-glow', name: 'Glow', description: 'Warm peach-coral radiance for glow products.', primary: '#3D2C2E', accent: '#F4A259', heading: 'Find your glow.', tagline: 'Radiance-boosting skincare and makeup.', cta: 'Shop glow', storyTitle: 'Lit from within', storyBody: 'Dewy, luminous formulas designed to bring out your natural radiance.', gridTitle: 'Glow picks' },
  { id: 'cosmetics-botanical-skincare', name: 'Botanical Skincare', description: 'Matcha-green plant-powered skincare.', primary: '#34423A', accent: '#C7CEA1', heading: 'Powered by plants.', tagline: 'Botanical actives for calm, balanced skin.', cta: 'Shop botanicals', storyTitle: 'Nature, refined', storyBody: 'Plant-derived actives, thoughtfully formulated and kind to skin and planet.', gridTitle: 'New & loved' },
  { id: 'cosmetics-bold-lip', name: 'Bold Lip', description: 'High-impact berry colour cosmetics.', primary: '#1B1B1B', accent: '#C81D4E', heading: 'Make it bold.', tagline: 'Pigment-rich colour that lasts all day.', cta: 'Shop makeup', storyTitle: 'Colour that commits', storyBody: 'Long-wear, high-pigment shades for lips, eyes, and cheeks.', gridTitle: 'Shop shades' },
  { id: 'cosmetics-soft-pastel', name: 'Soft Pastel', description: 'Lilac soft-pastel beauty.', primary: '#4A4A6A', accent: '#CDB4DB', heading: 'Soft on you.', tagline: 'Gentle, feel-good beauty essentials.', cta: 'Shop beauty', storyTitle: 'Gentle does it', storyBody: 'Soothing, sensorial formulas in soft pastel hues for a calmer routine.', gridTitle: 'Featured' },
];

const JEWELLERY: Spec[] = [
  { id: 'jewellery-classic-gold', name: 'Classic Gold', description: 'Black-and-gold classic fine jewellery.', primary: '#1C1C1C', accent: '#D4AF37', heading: 'Timeless in gold.', tagline: 'Fine pieces, crafted to be treasured.', cta: 'Shop fine jewellery', storyTitle: 'Crafted to last', storyBody: 'Hallmarked, hand-finished jewellery designed to be passed down.', gridTitle: 'The collection' },
  { id: 'jewellery-rose-gold', name: 'Rose Gold', description: 'Soft rose-gold romantic jewellery.', primary: '#2B2B2B', accent: '#B76E79', heading: 'A little romance.', tagline: 'Delicate rose-gold pieces for every day.', cta: 'Shop rose gold', storyTitle: 'Everyday elegance', storyBody: 'Soft, feminine designs that layer beautifully from desk to dinner.', gridTitle: 'New arrivals' },
  { id: 'jewellery-silver-minimal', name: 'Silver Minimal', description: 'Cool silver minimalist jewellery.', primary: '#20232A', accent: '#C0C0C8', heading: 'Quiet sparkle.', tagline: 'Minimal silver pieces with modern lines.', cta: 'Shop silver', storyTitle: 'Less is more', storyBody: 'Clean, contemporary silver designs for understated everyday wear.', gridTitle: 'Shop minimal' },
  { id: 'jewellery-emerald-luxe', name: 'Emerald Luxe', description: 'Emerald-and-gold high-luxury jewellery.', primary: '#0B3D2E', accent: '#D4AF37', heading: 'Jewels worth keeping.', tagline: 'Statement pieces with precious stones.', cta: 'Shop statement', storyTitle: 'Rare by design', storyBody: 'Bold, gemstone-led pieces for moments that deserve something special.', gridTitle: 'Statement pieces' },
  { id: 'jewellery-diamond-noir', name: 'Diamond Noir', description: 'Noir-and-ice modern diamond jewellery.', primary: '#0A0A0A', accent: '#8FD3F4', heading: 'Brilliance, refined.', tagline: 'Modern diamond and crystal jewellery.', cta: 'Shop diamonds', storyTitle: 'Cut to shine', storyBody: 'Precision-set stones in sleek modern settings, made to catch the light.', gridTitle: 'Featured' },
];

// Kitchenware — five storefronts, each tuned to a distinct shopper segment:
// professional cooks, budget first-home buyers, eco households, design-led
// urbanites, and traditional Indian-cuisine families.
const KITCHENWARE: Spec[] = [
  { id: 'kitchenware-pro-chef', name: 'Pro Chef', segment: 'Serious home cooks & professional chefs', description: 'Charcoal-and-copper professional cookware for people who take cooking seriously.', primary: '#1C1F22', accent: '#B87333', heading: 'Cook like a pro.', tagline: 'Restaurant-grade cookware and knives, built to perform.', cta: 'Shop professional', storyTitle: 'Tools that earn their place', storyBody: 'Heavy-gauge pans, full-tang knives, and precision tools chosen by people who cook every day — made to take the heat for years.', gridTitle: 'The pro range' },
  { id: 'kitchenware-first-kitchen', name: 'First Kitchen', segment: 'Students, newlyweds & first-home buyers on a budget', description: 'Bright, friendly starter kitchen at value prices.', primary: '#263238', accent: '#FFB703', heading: 'Everything to get started.', tagline: 'Affordable essentials to set up your very first kitchen.', cta: 'Shop starter sets', storyTitle: 'Your kitchen, sorted', storyBody: 'Wallet-friendly bundles with everything a new home needs — pots, pans, and tools that just work, without the markup.', gridTitle: 'Starter essentials' },
  { id: 'kitchenware-eco-conscious', name: 'Conscious Kitchen', segment: 'Eco-conscious, plastic-free households', description: 'Earthy, sustainable kitchenware in bamboo and natural materials.', primary: '#33402E', accent: '#94A684', heading: 'Kinder to your kitchen.', tagline: 'Plastic-free, responsibly made essentials for a greener home.', cta: 'Shop sustainable', storyTitle: 'Made to last, made to care', storyBody: 'Bamboo, stainless steel, and natural fibres — durable goods that cut the plastic and the waste without the compromise.', gridTitle: 'Sustainable picks' },
  { id: 'kitchenware-modern-minimal', name: 'Modern Table', segment: 'Design-led urban millennials', description: 'Sleek matte-black minimalism for the design-conscious home.', primary: '#1A1A1A', accent: '#C9C2B6', heading: 'Designed for the modern table.', tagline: 'Minimal, considered pieces that look as good as they cook.', cta: 'Shop the collection', storyTitle: 'Form meets function', storyBody: 'Matte finishes, clean lines, and a calm palette — cookware and tableware curated for a kitchen you want to show off.', gridTitle: 'New & considered' },
  { id: 'kitchenware-heritage-indian', name: 'Heritage Rasoi', segment: 'Traditional Indian families & regional-cuisine cooks', description: 'Warm brass, copper, and cast-iron cookware rooted in Indian tradition.', primary: '#4A2C1A', accent: '#C8772E', heading: 'The taste of tradition.', tagline: 'Brass, copper, and cast iron for authentic Indian cooking.', cta: 'Shop heritage', storyTitle: 'The way it was always made', storyBody: 'Hand-finished kadhais, tawas, and serveware in time-honoured metals — the cookware your dishes were meant for.', gridTitle: 'Heritage cookware' },
];

// Perfumes — five storefronts, each tuned to a distinct shopper segment:
// niche-luxury connoisseurs, budget-conscious Gen-Z, natural/attar buyers,
// gender-neutral minimalists, and occasion/gift shoppers.
const PERFUMES: Spec[] = [
  { id: 'perfumes-luxury-niche', name: 'Maison Noir', segment: 'Luxury & niche-fragrance connoisseurs', description: 'Opulent black-and-gold house for niche and designer fragrances.', primary: '#0C0C0C', accent: '#C5A253', heading: 'An olfactory signature.', tagline: 'Rare, long-lasting parfums for the true connoisseur.', cta: 'Discover the maison', storyTitle: 'Composed, not manufactured', storyBody: 'A tightly curated house of niche and designer parfums — rich concentrations, rare materials, and scents worth collecting.', gridTitle: 'The collection' },
  { id: 'perfumes-everyday-genz', name: 'Daily Mist', segment: 'Gen-Z & students — affordable everyday scents', description: 'Bright, playful body mists and everyday fragrances at friendly prices.', primary: '#2D2A40', accent: '#FF6B9D', heading: 'A scent for every day.', tagline: 'Fun, affordable mists and sprays to match your mood.', cta: 'Shop the mists', storyTitle: 'Smell good, spend less', storyBody: 'Light, layerable body mists and everyday scents in playful notes — easy to love, easy on the wallet.', gridTitle: 'Everyday favourites' },
  { id: 'perfumes-natural-attar', name: 'Pure Attar', segment: 'Clean-beauty & traditional attar / ittar buyers', description: 'Amber-and-sandalwood house for alcohol-free, oil-based attars.', primary: '#3B2A1A', accent: '#C99659', heading: 'Pure, alcohol-free attars.', tagline: 'Traditional oil-based ittars, crafted from natural materials.', cta: 'Shop attars', storyTitle: 'The original perfume', storyBody: 'Alcohol-free, skin-kind attars distilled the traditional way — oud, rose, musk, and sandalwood that bloom with your skin.', gridTitle: 'Signature attars' },
  { id: 'perfumes-unisex-modern', name: 'Neutral', segment: 'Modern, gender-neutral minimalists', description: 'Calm, gender-neutral minimalism for contemporary fragrance.', primary: '#2B2E2C', accent: '#A6B0A2', heading: 'Fragrance without labels.', tagline: 'Clean, unisex scents for everyone.', cta: 'Shop unisex', storyTitle: 'Scent, simplified', storyBody: 'Modern, gender-neutral compositions in a quiet minimalist palette — wearable, versatile, and made for anyone.', gridTitle: 'Unisex edit' },
  { id: 'perfumes-gifting-occasion', name: 'The Gift Edit', segment: 'Gift shoppers & festive / occasion buyers', description: 'Blush-and-rose-gold house built around gift sets and occasions.', primary: '#3A2A2E', accent: '#D8A7B1', heading: 'The art of gifting scent.', tagline: 'Beautifully boxed fragrance sets for every occasion.', cta: 'Shop gift sets', storyTitle: 'Wrapped and ready', storyBody: 'Elegant gift sets, festive editions, and ready-to-give boxes — make every birthday, wedding, and Diwali unforgettable.', gridTitle: 'Gift sets & editions' },
];

/**
 * All 30 store templates — 5 each for fashion, lifestyle, cosmetics, jewellery,
 * kitchenware, and perfumes. Within kitchenware and perfumes, the five share a
 * vertical but each targets a distinct customer segment (see `segment`).
 */
export const STORE_TEMPLATES: StoreTemplate[] = [
  ...FASHION.map((s) => build('fashion', s)),
  ...LIFESTYLE.map((s) => build('lifestyle', s)),
  ...COSMETICS.map((s) => build('cosmetics', s)),
  ...JEWELLERY.map((s) => build('jewellery', s)),
  ...KITCHENWARE.map((s) => build('kitchenware', s)),
  ...PERFUMES.map((s) => build('perfumes', s)),
];
