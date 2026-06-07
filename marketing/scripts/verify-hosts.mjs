// Verifies that the exact production domains route to the correct landing page.
// Run: pnpm --filter acp-marketing verify
import { resolveAudience, MERCHANT_DOMAIN, PARTNER_DOMAIN } from '../src/host.js';

const cases = [
  [MERCHANT_DOMAIN, 'merchant'],              // ecom.imagine.bo
  [`www.${MERCHANT_DOMAIN}`, 'merchant'],
  [PARTNER_DOMAIN, 'partner'],                // ecompartner.imagine.bo
  [`www.${PARTNER_DOMAIN}`, 'partner'],
  ['ecom.imagine.bo:5180', 'merchant'],       // port stripped
  ['ecompartner-staging.imagine.bo', 'partner'],
  ['localhost', 'merchant'],                  // dev default
];

let failed = 0;
for (const [host, expected] of cases) {
  const got = resolveAudience(host);
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${host.padEnd(34)} -> ${got} (expected ${expected})`);
}

if (failed) {
  console.error(`\n${failed} host-routing check(s) failed.`);
  process.exit(1);
}
console.log('\nAll host-routing checks passed: ecom.imagine.bo -> merchant, ecompartner.imagine.bo -> partner.');
