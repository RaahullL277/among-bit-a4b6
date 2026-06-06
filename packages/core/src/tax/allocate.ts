/**
 * Distribute `total` across `weights` so the parts are proportional to the
 * weights AND sum back to exactly `total` (largest-remainder method). Used to
 * split an order's discount, GST, and paid amount across its lines without
 * rounding drift. Shared by invoicing and returns so they agree to the paise.
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0 || total === 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const floors = exact.map((x) => Math.floor(x));
  let remainder = total - floors.reduce((s, f) => s + f, 0);
  // Hand the leftover units to the lines with the largest fractional parts.
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (let k = 0; k < order.length && remainder > 0; k++) {
    out[order[k].i] += 1;
    remainder -= 1;
  }
  return out;
}
