import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
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
