// Tolerance corners: every combination of each part at its − and + limit.

/**
 * All 2^n combinations of multipliers (1 − t) and (1 + t), one per tolerance fraction.
 * corners([0.01, 0.05]) → [[0.99, 0.95], [1.01, 0.95], [0.99, 1.05], [1.01, 1.05]].
 */
export function corners(tols: number[]): number[][] {
  const n = tols.length;
  const out: number[][] = [];
  for (let mask = 0; mask < 1 << n; mask++) {
    out.push(tols.map((t, i) => (mask & (1 << i) ? 1 + t : 1 - t)));
  }
  return out;
}

/** Min and max of f over every tolerance corner (plus the nominal point). */
export function spreadOf(f: (factors: number[]) => number, tols: number[]): { min: number; max: number } {
  let min = f(tols.map(() => 1));
  let max = min;
  for (const factors of corners(tols)) {
    const v = f(factors);
    if (!Number.isFinite(v)) continue;
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  return { min, max };
}
