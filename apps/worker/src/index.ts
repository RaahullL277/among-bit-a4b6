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
// The store advisor is a heavier full-store scan; run it on its own slow cadence.
const ADVISORY_INTERVAL_MS = Number(process.env.ADVISORY_INTERVAL_MS ?? 6 * 60 * 60_000);
const commerce = getCommerce();
let running = false;
let lastAdvisoryAt = 0;

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
    // Free stock held by pending orders that never paid within the TTL.
    const expired = await commerce.stock.releaseExpiredReservations();
    if (expired.released) {
      // eslint-disable-next-line no-console
      console.log(`[worker] reservations: released ${expired.released} expired holds`);
    }
    // Cohort recompute, cadence per store by daily-visitor volume (nightly ≥10k,
    // weekly ≥1k, monthly otherwise).
    const cohorts = await commerce.cohorts.runDueRecomputes();
    if (cohorts.recomputed) {
      // eslint-disable-next-line no-console
      console.log(`[worker] cohorts: recomputed ${cohorts.recomputed}/${cohorts.scanned} stores`);
    }
    const subs = await commerce.subscriptions.runDueSubscriptions();
    if (subs.orders || subs.failed) {
      // eslint-disable-next-line no-console
      console.log(`[worker] subscriptions: ${subs.orders} orders generated, ${subs.failed} failed`);
    }
    // Engagement automations: once-daily per opted-in store, respecting quiet
    // hours and the temperature frequency caps.
    const engagement = await commerce.engagement.runDueEngagement();
    if (engagement.ran) {
      // eslint-disable-next-line no-console
      console.log(`[worker] engagement: ran ${engagement.ran}/${engagement.scanned} stores, ${engagement.sent} messages sent`);
    }
    // Store advisor: push critical "next best action" alerts to owners, deduped
    // per code per day, on a slow cadence.
    if (Date.now() - lastAdvisoryAt >= ADVISORY_INTERVAL_MS) {
      lastAdvisoryAt = Date.now();
      const advisory = await commerce.advisor.runDueAdvisories();
      if (advisory.dispatched) {
        // eslint-disable-next-line no-console
        console.log(`[worker] advisor: ${advisory.dispatched} critical alerts sent across ${advisory.scanned} stores`);
      }
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
