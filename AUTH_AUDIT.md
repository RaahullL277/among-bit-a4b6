# Authentication & Authorization Audit

Audited 2026-06-06. Three separate identity planes, each with its own session
table and guard. Tokens are random 192-bit secrets, persisted only as SHA-256
hashes; nothing reversible is stored. This document records the audit findings
across all three planes and the sign-in methods added for the merchant plane.

---

## Planes & roles

### 1. Platform operator (the SaaS company's back-office)
- **Identity:** `PlatformUser` · sessions `PlatformSession` (`psa_`), TTL **12h**.
- **Sign-in:** magic link only (`PlatformAuthService`); **no self-signup** — staff are provisioned by a SUPER_ADMIN (or seed). Email-enumeration-safe: `requestMagicLink` returns `{token:null}` for unknown emails.
- **Roles** (`PlatformRole` → `PLATFORM_ROLE_PERMISSIONS`):
  - `SUPER_ADMIN` — tenants r/w, billing, staff, audit.
  - `SUPPORT` — tenants r/w, audit.
  - `BILLING` — tenants read, billing, audit.
  - `READ_ONLY` — tenants read.
- **Guard:** `PlatformAuthGuard` resolves `psa_` → `PlatformContext`; routes gated by `requirePlatformPermission`. Last-super-admin protection on role-change/remove.

### 2. Merchant / store owner (+ staff roles)
- **Identity:** global `User` (can belong to many tenants via `Membership`) · sessions `Session` (`ses_`), TTL **30 days**.
- **Roles** (`Role` → `ROLE_PERMISSIONS`): `OWNER` (full incl. API keys), `ADMIN` (full except API keys), `STAFF` (catalog/order ops only). Permissions are coarse-grained (`stores:*`, `products:*`, `orders:*`, `customers:*`, `integrations:write`, `notifications:write`, `members:manage`, `apikeys:manage`).
- **API keys** (`sk_`): tenant-scoped, hashed, granted ALL permissions (trusted programmatic/agent access).
- **Guard:** `AuthGuard` resolves the credential by prefix (`pts_`/`ses_`/`sk_`) → `TenantContext` with an `actor`; routes gated by `@Permissions`.

### 3. Partner / agency
- **Identity:** `Partner` · sessions `PartnerSession` (`pts_`), TTL **12h**; magic link only, no self-signup.
- **Delegated access:** a partner acts on a client store by sending `x-acp-client: <tenantId>`; the granted permissions are governed by the **client-controlled** `PartnerAccessLevel` (MANAGE → full, VIEW → read-only, NONE → denied). A partner cannot raise its own access.

---

## Findings

**Sound:**
- Clean separation of the three identity planes; no privilege bleed between them.
- Tokens hashed at rest; credential encryption (AES-256-GCM) for integration secrets.
- Operator/partner sessions short-lived (12h); platform login is enumeration-safe.
- RBAC enforced centrally at the guard via declarative `@Permissions`; partner delegation is client-governed and a partner can't escalate itself.
- Tenant suspension is re-checked on every merchant session resolve.

**Gaps addressed:**
- Merchant plane was **passwordless-only** (magic link). Added: **email + password**, **phone-number OTP**, **Google/Apple OAuth**, and **TOTP two-factor**.
- **Platform-operator and partner planes** now also support **Google/Apple OAuth** (sign-in for existing accounts only — never auto-provisioned) and **TOTP two-factor** (challenge after the magic-link/OAuth first factor), reusing the same crypto primitives + injectable verifier. REST: `POST /platform/auth/{oauth,2fa/setup,2fa/enable,2fa/disable,2fa/verify}` and `POST /partner/auth/{oauth,2fa/*}`; both consoles handle the 2FA login challenge and have a self-serve Security page. Models: `PlatformUser`/`Partner` gained `twoFactorSecret`/`twoFactorEnabledAt`; new `PlatformOAuthIdentity`, `PartnerOAuthIdentity`, `PlatformTwoFactorChallenge`, `PartnerTwoFactorChallenge`.

**Remaining recommendations (follow-ups, not yet done):**
- **Merchant magic-link enumeration** — `auth.requestMagicLink` issues a token for any email (the merchant flow predates the platform's enumeration-safe pattern); align it to return success without revealing existence. (Password/OAuth/OTP login errors are already generic; platform/partner magic-link is already enumeration-safe.)
- **Merchant session TTL** — 30 days is long; consider 7 days or sliding expiry (also noted in `AUDIT.md` P2).
- **OTP/login rate-limiting** — OTP has per-code attempt locking (5) + 5-min TTL; add per-identifier request throttling at the edge to prevent SMS-bombing.
- **Passkeys/WebAuthn** — future. Phone-OTP + password on the operator/partner planes (currently merchant-only) if desired.

---

## Sign-in methods added (merchant `User` plane)

All issue the same `Session`; when an account has 2FA enabled, the first factor
returns a short-lived **challenge** instead of a session, exchanged for a session
via `verifyTwoFactor`.

| Method | Service | REST |
|---|---|---|
| Email + password (register/login) | `registerWithPassword`, `loginWithPassword`, `setPassword` | `POST /auth/register`, `/auth/login`, `/auth/password` |
| Phone-number OTP | `requestPhoneOtp`, `verifyPhoneOtp` | `POST /auth/phone/request`, `/auth/phone/verify` |
| Google / Apple OAuth | `oauthLogin` (+ `HttpOAuthVerifier`) | `POST /auth/oauth` |
| TOTP 2FA | `setupTwoFactor`, `enableTwoFactor`, `disableTwoFactor`, `verifyTwoFactor` | `POST /auth/2fa/{setup,enable,disable,verify}` |

- **Passwords:** scrypt (N=16384) with per-hash salt; constant-time verify.
- **OTP:** 6-digit, hashed at rest, 5-min TTL, 5-attempt lockout; delivered via the injectable `OtpSender` (dev returns the code, like magic-link `devLink`).
- **OAuth:** Google validated via the tokeninfo endpoint; Apple identity-token JWT verified (RS256) against Apple's JWKS; audience checked against `GOOGLE_CLIENT_ID` / `APPLE_CLIENT_ID` when set. The verifier is injectable (tested offline with a fake). New users get a workspace; existing users are linked by email via `OAuthIdentity`.
- **2FA:** RFC-6238 TOTP (SHA-1, 6 digits, 30s, ±1 step). Secret generated server-side, **encrypted at rest**, and only activated after the user confirms a code (`otpauth://` URI returned for the authenticator app).

### Required integrations / env
- `GOOGLE_CLIENT_ID`, `APPLE_CLIENT_ID` — OAuth audience validation (verification still works without them, but setting them is strongly recommended in production).
- `TWO_FA_ISSUER` — label shown in authenticator apps (default "ACP Commerce").
- **SMS for OTP** — wire a global SMS provider into the `OtpSender` (the existing Msg91 adapter is per-store; account-level OTP needs a platform-level sender). Until then, dev returns the code and delivery is a no-op.

### Schema additions
`User` gained `phone` (unique), `passwordHash`, `twoFactorSecret` (encrypted), `twoFactorEnabledAt`; new models `OAuthIdentity`, `OtpCode`, `TwoFactorChallenge`; new enum `OAuthProvider`.
