// Bracketed root finding for solve options with no closed form.

export interface RootOptions {
  /** Relative tolerance on x. */
  tol?: number;
  maxIter?: number;
  /** Search on a log scale (x must stay positive). Default true when lo > 0. */
  log?: boolean;
}

/**
 * Find x in [lo, hi] with f(x) = 0 by bisection (Illinois-style false position would be faster,
 * but bisection is predictable and fast enough here). Returns NaN if f(lo) and f(hi) have the
 * same sign.
 */
export function bisect(f: (x: number) => number, lo: number, hi: number, opts: RootOptions = {}): number {
  const { tol = 1e-12, maxIter = 200 } = opts;
  const log = opts.log ?? lo > 0;
  let flo = f(lo);
  const fhi = f(hi);
  if (flo === 0) return lo;
  if (fhi === 0) return hi;
  if (Math.sign(flo) === Math.sign(fhi) || Number.isNaN(flo) || Number.isNaN(fhi)) return NaN;
  let a = lo;
  let b = hi;
  for (let i = 0; i < maxIter; i++) {
    const mid = log ? Math.sqrt(a * b) : (a + b) / 2;
    const fm = f(mid);
    if (fm === 0) return mid;
    if (Math.sign(fm) === Math.sign(flo)) {
      a = mid;
      flo = fm;
    } else b = mid;
    if (Math.abs(b - a) <= tol * Math.max(Math.abs(a), Math.abs(b))) break;
  }
  return log ? Math.sqrt(a * b) : (a + b) / 2;
}

/**
 * Expand [lo, hi] geometrically until f changes sign, then bisect. Useful when only a rough
 * starting range is known.
 */
export function findRoot(
  f: (x: number) => number,
  guess: number,
  opts: RootOptions & { factor?: number; tries?: number } = {},
): number {
  const { factor = 10, tries = 30 } = opts;
  let lo = guess / factor;
  let hi = guess * factor;
  for (let i = 0; i < tries; i++) {
    const flo = f(lo);
    const fhi = f(hi);
    if (Math.sign(flo) !== Math.sign(fhi)) return bisect(f, lo, hi, opts);
    lo /= factor;
    hi *= factor;
  }
  return NaN;
}
