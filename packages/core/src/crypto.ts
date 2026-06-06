import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Cryptographic helpers used across the platform:
 *  - API keys are hashed (SHA-256) before storage; only the hash is persisted.
 *  - Integration credentials are encrypted at rest with AES-256-GCM.
 */

const ENC_ALGO = 'aes-256-gcm';

function encryptionKey(): Buffer {
  const raw = process.env.CORE_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'CORE_ENCRYPTION_KEY is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('CORE_ENCRYPTION_KEY must decode to exactly 32 bytes (base64).');
  }
  return key;
}

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

export interface GeneratedApiKey {
  /** The full secret, shown to the caller exactly once. */
  raw: string;
  /** SHA-256 hash of `raw` — this is what we persist and look up by. */
  keyHash: string;
  /** Non-secret display hint, e.g. "sk_live_a1b2". */
  prefix: string;
}

export function generateApiKey(): GeneratedApiKey {
  const secret = randomBytes(24).toString('base64url');
  const raw = `sk_live_${secret}`;
  return {
    raw,
    keyHash: hashApiKey(raw),
    prefix: raw.slice(0, 12),
  };
}

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Opaque single-use/session tokens (magic links, invites, sessions). The raw
 * value is returned once; only its SHA-256 hash is persisted and looked up by.
 */
export function generateToken(prefix: string): { raw: string; hash: string } {
  const raw = `${prefix}_${randomBytes(24).toString('base64url')}`;
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

// ---------------------------------------------------------------------------
// Credential encryption (AES-256-GCM)
// ---------------------------------------------------------------------------

export interface EncryptedBlob {
  iv: string;
  tag: string;
  data: string;
}

export function encryptJson(value: unknown): EncryptedBlob {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ENC_ALGO, encryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64'),
  };
}

export function decryptJson<T = unknown>(blob: EncryptedBlob): T {
  const decipher = createDecipheriv(
    ENC_ALGO,
    encryptionKey(),
    Buffer.from(blob.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(blob.data, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8')) as T;
}

// ---------------------------------------------------------------------------
// Passwords (scrypt)
// ---------------------------------------------------------------------------

const SCRYPT_N = 16384;
const SCRYPT_KEYLEN = 64;

/** Hash a password with scrypt + a random salt. Format: "scrypt$N$salt$hash". */
export function hashPassword(password: string): string {
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N });
  return `scrypt$${SCRYPT_N}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/** Constant-time password verification against a stored scrypt hash. */
export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]);
  const salt = Buffer.from(parts[2], 'base64');
  const expected = Buffer.from(parts[3], 'base64');
  let actual: Buffer;
  try {
    actual = scryptSync(password, salt, expected.length, { N });
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// ---------------------------------------------------------------------------
// One-time passcodes (numeric, for phone/email OTP)
// ---------------------------------------------------------------------------

/** A cryptographically-random numeric OTP of the given length (default 6). */
export function generateNumericOtp(length = 6): string {
  let out = '';
  const bytes = randomBytes(length);
  for (let i = 0; i < length; i++) out += (bytes[i] % 10).toString();
  return out;
}

// ---------------------------------------------------------------------------
// TOTP (RFC 6238) for two-factor authentication
// ---------------------------------------------------------------------------

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').toUpperCase().replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh base32 TOTP secret (160-bit). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Compute the 6-digit TOTP for a base32 secret at a given time (default now). */
export function totp(secretBase32: string, atMs: number = Date.now(), period = 30, digits = 6): string {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(atMs / 1000 / period);
  const buf = Buffer.alloc(8);
  // 64-bit big-endian counter.
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % 10 ** digits).toString().padStart(digits, '0');
}

/** Verify a TOTP code, tolerating ±`window` steps of clock drift. */
export function verifyTotp(secretBase32: string, code: string, window = 1, atMs: number = Date.now(), period = 30): boolean {
  const candidate = String(code ?? '').trim();
  if (!/^\d{6}$/.test(candidate)) return false;
  for (let w = -window; w <= window; w++) {
    if (totp(secretBase32, atMs + w * period * 1000, period) === candidate) return true;
  }
  return false;
}

/** Build the otpauth:// URI an authenticator app scans to add the account. */
export function otpauthUrl(secretBase32: string, label: string, issuer: string): string {
  const enc = encodeURIComponent;
  return `otpauth://totp/${enc(issuer)}:${enc(label)}?secret=${secretBase32}&issuer=${enc(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
