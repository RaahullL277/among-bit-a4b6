import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { ValidationError } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('store-build leads', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  const created: string[] = [];

  afterAll(async () => {
    await prisma.storeBuildLead.deleteMany({ where: { id: { in: created } } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('captures a merchant lead with prompt + asset manifest', async () => {
    const res = await commerce.leads.submit({
      source: 'MERCHANT',
      email: 'Owner@Example.com',
      prompt: 'I sell handmade soy candles and want a cozy store.',
      businessName: 'Glow & Co',
      assets: [{ name: 'logo.png', type: 'image/png', size: 1234, dataUrl: 'data:image/png;base64,AAAA' }],
      referrer: 'ecom.imagine.bo',
    });
    created.push(res.id);
    expect(res.source).toBe('MERCHANT');
    expect(res.status).toBe('NEW');
    expect(res.assetCount).toBe(1);

    const row = await prisma.storeBuildLead.findUnique({ where: { id: res.id } });
    expect(row?.email).toBe('owner@example.com'); // normalized
    expect((row?.assets as any[])[0].name).toBe('logo.png');
  });

  it('defaults to MERCHANT and rejects an empty prompt / bad email', async () => {
    const res = await commerce.leads.submit({ email: 'p@x.com', prompt: 'Agency building stores for clients' });
    created.push(res.id);
    expect(res.source).toBe('MERCHANT');

    await expect(commerce.leads.submit({ email: 'p@x.com', prompt: ' ' })).rejects.toBeInstanceOf(ValidationError);
    await expect(commerce.leads.submit({ email: 'nope', prompt: 'a valid prompt' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('caps the asset manifest and drops oversized inline previews', async () => {
    const big = 'data:image/png;base64,' + 'A'.repeat(800_000);
    const assets = Array.from({ length: 20 }, (_, i) => ({ name: `f${i}.png`, dataUrl: big }));
    const res = await commerce.leads.submit({ source: 'PARTNER', email: 'a@b.com', prompt: 'Partner agency', assets });
    created.push(res.id);
    expect(res.source).toBe('PARTNER');
    expect(res.assetCount).toBe(12); // capped

    const row = await prisma.storeBuildLead.findUnique({ where: { id: res.id } });
    expect((row?.assets as any[]).every((a) => a.dataUrl === undefined)).toBe(true); // oversized previews dropped
  });
});
