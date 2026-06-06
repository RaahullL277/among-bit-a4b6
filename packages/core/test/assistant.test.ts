import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { SupportAssistantService } from '../src/services/support-assistant.service.js';
import { StubAssistant } from '../src/assistant/stub.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('support assistant (stub)', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  // Force the deterministic stub regardless of ANTHROPIC_API_KEY in the env.
  const assistant = new SupportAssistantService(commerce.platform, commerce.platformAnalytics, new StubAssistant());
  let tenantId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: `Assistant Co ${Date.now()}` } });
    tenantId = tenant.id;
    const store = await commerce.stores.create({ tenantId }, { name: 'Assistant Store' });
    await prisma.order.create({
      data: { tenantId, storeId: store.id, number: 1, status: 'PAID', totalMinor: 250000 },
    });
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('answers a GMV question using the overview tool', async () => {
    const res = await assistant.chat([{ role: 'user', content: "What's our GMV this month?" }]);
    expect(res.provider).toBe('stub');
    expect(res.toolsUsed).toContain('overview');
    expect(res.reply).toMatch(/GMV/);
  });

  it('answers a top-merchants question', async () => {
    const res = await assistant.chat([{ role: 'user', content: 'Who are the top merchants?' }]);
    expect(res.toolsUsed).toContain('top_merchants');
  });

  it('falls back to help text for unknown questions', async () => {
    const res = await assistant.chat([{ role: 'user', content: 'tell me a joke' }]);
    expect(res.toolsUsed).toHaveLength(0);
    expect(res.reply).toMatch(/I can answer/);
  });
});
