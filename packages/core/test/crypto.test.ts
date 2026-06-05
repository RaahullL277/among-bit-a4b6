import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { decryptJson, encryptJson, generateApiKey, hashApiKey } from '../src/crypto.js';

beforeAll(() => {
  process.env.CORE_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

describe('api keys', () => {
  it('generates a prefixed key whose hash is stable and matches', () => {
    const key = generateApiKey();
    expect(key.raw.startsWith('sk_live_')).toBe(true);
    expect(key.prefix).toBe(key.raw.slice(0, 12));
    expect(hashApiKey(key.raw)).toBe(key.keyHash);
  });
});

describe('credential encryption', () => {
  it('round-trips JSON via AES-256-GCM', () => {
    const secret = { keyId: 'rzp_test_x', webhookSecret: 'shh' };
    const blob = encryptJson(secret);
    expect(blob.data).not.toContain('rzp_test_x');
    expect(decryptJson(blob)).toEqual(secret);
  });

  it('fails to decrypt a tampered payload', () => {
    const blob = encryptJson({ a: 1 });
    expect(() => decryptJson({ ...blob, tag: Buffer.alloc(16).toString('base64') })).toThrow();
  });
});
