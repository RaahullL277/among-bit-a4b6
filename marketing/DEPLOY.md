# Deploying the two landing-page domains

Both domains are served by the **same** `acp-marketing` build; the app picks the
audience from the request hostname (`src/host.js`). SPA fallback config is
included for the common static hosts so any path serves the app:
`vercel.json` (rewrites) and `public/_redirects` (Netlify/Cloudflare Pages).

## Domain → page mapping (first-class, verified)

| Domain | Serves | Resolved by |
|---|---|---|
| `ecom.imagine.bo` (+ `www.`) | **Merchant** landing | `resolveAudience()` exact match → `merchant` |
| `ecompartner.imagine.bo` (+ `www.`) | **Partner** landing | `resolveAudience()` exact match → `partner` |

Run the check any time:

```bash
pnpm --filter acp-marketing verify
# PASS  ecom.imagine.bo          -> merchant ...
# PASS  ecompartner.imagine.bo   -> partner  ...
```

## Steps

1. **Build:** `pnpm --filter acp-marketing build` → `marketing/dist/`.
2. **Host the `dist/`** on your static host (Vercel/Netlify/Cloudflare Pages/S3+CDN).
3. **Add both custom domains** to the same deployment:
   - `ecom.imagine.bo` and `www.ecom.imagine.bo`
   - `ecompartner.imagine.bo` and `www.ecompartner.imagine.bo`
4. **DNS:** point each domain's `CNAME`/`A`/`ALIAS` at the host (per provider).
5. **Env** (`marketing/.env`): set `VITE_API_URL` to the public ACP API, and
   `VITE_ADMIN_URL` / `VITE_PARTNER_URL` to the merchant admin & partner portal.

Because host detection is client-side, the same `index.html`/bundle is served to
both domains; the correct page renders in the browser based on `location.hostname`.
Explicit routes `/merchants` and `/partners` always work for cross-linking and
local testing.
