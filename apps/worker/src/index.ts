import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load the repo-root .env regardless of cwd (mirrors the MCP server).
const moduleDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(moduleDir, '../../../.env') });
config({ path: resolve(process.cwd(), '.env') });
config();

import { getCommerce } from '@acp/core';

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 60_000);
const commerce = getCommerce();
let running = false;

async function tick() {
  if (running) return; // avoid overlapping runs
  running = true;
  try {
    const recovery = await commerce.carts.runRecoveryJobs();
    if (recovery.abandoned || recovery.messagesSent) {
      // eslint-disable-next-line no-console
      console.log(
        `[worker] cart recovery: ${recovery.abandoned} abandoned, ${recovery.messagesSent} messages sent`,
      );
    }
    const stock = await commerce.stock.recomputeAndAlert();
    if (stock.alerts) {
      // eslint-disable-next-line no-console
      console.log(`[worker] stock: ${stock.scanned} scanned, ${stock.alerts} alerts sent`);
    }
    const subs = await commerce.subscriptions.runDueSubscriptions();
    if (subs.orders || subs.failed) {
      // eslint-disable-next-line no-console
      console.log(`[worker] subscriptions: ${subs.orders} orders generated, ${subs.failed} failed`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[worker] job failed:', err);
  } finally {
    running = false;
  }
}

// eslint-disable-next-line no-console
console.log(`⚙️  ACP worker started (every ${INTERVAL_MS}ms)`);
void tick();
setInterval(tick, INTERVAL_MS);
