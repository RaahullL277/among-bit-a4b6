import { createPublicKey, verify as cryptoVerify } from 'node:crypto';

/** A verified identity returned by an OAuth provider. */
export interface OAuthProfile {
  providerUserId: string; // the provider's stable subject id ("sub")
  email?: string;
  name?: string;
}

export type OAuthProviderName = 'GOOGLE' | 'APPLE';

/** Verifies a provider id-token and returns the authenticated profile. */
export interface OAuthVerifier {
  verify(provider: OAuthProviderName, idToken: string): Promise<OAuthProfile>;
}

type FetchImpl = typeof fetch;

function b64urlToBuffer(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
function decodeJwtPart(part: string): any {
  return JSON.parse(b64urlToBuffer(part).toString('utf8'));
}

/**
 * Production OAuth verifier:
 *  - Google: validates the id_token via Google's tokeninfo endpoint.
 *  - Apple: verifies the identity-token JWT (RS256) against Apple's JWKS.
 * Audience is checked against GOOGLE_CLIENT_ID / APPLE_CLIENT_ID when set.
 * `fetchImpl` is injectable so the flow can be tested without network access.
 */
export class HttpOAuthVerifier implements OAuthVerifier {
  constructor(private readonly fetchImpl: FetchImpl = fetch) {}

  async verify(provider: OAuthProviderName, idToken: string): Promise<OAuthProfile> {
    if (!idToken) throw new Error('An OAuth id_token is required.');
    return provider === 'GOOGLE' ? this.verifyGoogle(idToken) : this.verifyApple(idToken);
  }

  private async verifyGoogle(idToken: string): Promise<OAuthProfile> {
    const res = await this.fetchImpl(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!res.ok) throw new Error('Google rejected the id_token.');
    const p: any = await res.json();
    const expectedAud = process.env.GOOGLE_CLIENT_ID;
    // Fail closed: in production an unset client id is a misconfiguration, not a
    // licence to accept tokens minted for any other Google app.
    if (!expectedAud && process.env.NODE_ENV === 'production') throw new Error('Google OAuth is not configured (GOOGLE_CLIENT_ID).');
    if (expectedAud && p.aud !== expectedAud) throw new Error('Google token audience mismatch.');
    if (!p.sub) throw new Error('Google token missing subject.');
    return { providerUserId: String(p.sub), email: p.email, name: p.name };
  }

  private async verifyApple(idToken: string): Promise<OAuthProfile> {
    const [headerB64, payloadB64, sigB64] = idToken.split('.');
    if (!headerB64 || !payloadB64 || !sigB64) throw new Error('Malformed Apple identity token.');
    const header = decodeJwtPart(headerB64);
    const payload = decodeJwtPart(payloadB64);

    const res = await this.fetchImpl('https://appleid.apple.com/auth/keys');
    if (!res.ok) throw new Error('Could not fetch Apple public keys.');
    const { keys }: any = await res.json();
    const jwk = (keys ?? []).find((k: any) => k.kid === header.kid);
    if (!jwk) throw new Error('No matching Apple signing key.');

    const pubKey = createPublicKey({ key: jwk, format: 'jwk' });
    const signingInput = Buffer.from(`${headerB64}.${payloadB64}`);
    const ok = cryptoVerify('RSA-SHA256', signingInput, pubKey, b64urlToBuffer(sigB64));
    if (!ok) throw new Error('Apple token signature is invalid.');

    if (payload.iss !== 'https://appleid.apple.com') throw new Error('Apple token issuer mismatch.');
    const expectedAud = process.env.APPLE_CLIENT_ID;
    if (!expectedAud && process.env.NODE_ENV === 'production') throw new Error('Apple OAuth is not configured (APPLE_CLIENT_ID).');
    if (expectedAud && payload.aud !== expectedAud) throw new Error('Apple token audience mismatch.');
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) throw new Error('Apple token has expired.');
    if (!payload.sub) throw new Error('Apple token missing subject.');
    return { providerUserId: String(payload.sub), email: payload.email };
  }
}
