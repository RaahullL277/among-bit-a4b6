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
    const result = await commerce.carts.runRecoveryJobs();
    if (result.abandoned || result.messagesSent) {
      // eslint-disable-next-line no-console
      console.log(
        `[worker] cart recovery: ${result.abandoned} abandoned, ${result.messagesSent} messages sent`,
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[worker] recovery job failed:', err);
  } finally {
    running = false;
  }
}

// eslint-disable-next-line no-console
console.log(`⚙️  ACP worker started (every ${INTERVAL_MS}ms)`);
void tick();
setInterval(tick, INTERVAL_MS);
