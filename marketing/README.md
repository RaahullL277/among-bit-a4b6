# Marketing landing pages (`acp-marketing`)

Two conversion-focused landing pages that share one Vite/React app and one
codebase, served on two domains:

| Domain | Audience | Home route | Content |
|---|---|---|---|
| **ecom.imagine.bo** | Store owners (merchants) | `/` | `MERCHANT` in `src/content.js` |
| **ecompartner.imagine.bo** | Partners (agencies, freelancers, resellers) | `/` | `PARTNER` in `src/content.js` |

`src/App.jsx` picks the home page by **hostname** (`ecompartner.*`/`*partner*`
→ partner site), and both are always reachable by explicit route
(`/merchants`, `/partners`) for cross-linking and dev. Point each domain's DNS
at the same deployment.

## Page scope (sections)

Both pages, driven entirely by `content.js`:

1. **Hero + builder bar** — headline, sub, and the "start building your store"
   bar (see below).
2. **Why we're the right partner for your success** — narrative + 4 proof points.
3. **Benefits** — 4 outcome-focused benefits.
4. **Features** — 6 capability cards (icons mapped in `Landing.jsx`).
5. **Value** — headline stats band.
6. **Comparison vs competitors** — *merchant page only* — Imagine vs **Shopify,
   WooCommerce, Dukaan** (`ComparisonTable.jsx`, data in `MERCHANT.comparison`).
7. **Reviews** — 3 testimonials with star ratings.
8. **Final CTA** — repeats the builder bar.

## The builder bar (`components/BuilderBar.jsx`)

The core conversion element on both pages:

- A **prompt textarea** ("describe your store"), an **email**, and
  **image/file import** via drag-and-drop or a picker (`Import images & files`).
- Small images become inline previews (`FileReader` → data URL, ≤500 KB);
  other files are kept as a name/type/size manifest. Client caps at 12 files.
- On submit it POSTs to the public API:
  `POST /leads/store-build` `{ source: MERCHANT|PARTNER, email, prompt,
  businessName?, assets[], referrer }` → `LeadService.submit` persists a
  `StoreBuildLead` (no tenant yet — top-of-funnel).
- On success it shows a confirmation and a **Continue setup** link that carries
  `email` + `prompt` into the merchant admin (`VITE_ADMIN_URL`) or partner
  portal (`VITE_PARTNER_URL`) signup.

## Config (`.env`)

- `VITE_API_URL` — ACP API base (public `/leads/*`).
- `VITE_ADMIN_URL` — merchant admin console (merchant "continue setup").
- `VITE_PARTNER_URL` — partner portal (partner "continue setup").

## Run

```bash
pnpm --filter acp-marketing dev     # http://localhost:5180
pnpm --filter acp-marketing build
```
