// IEC 60063 preferred-number series E3…E192.

export const SERIES_NAMES = ['E3', 'E6', 'E12', 'E24', 'E48', 'E96', 'E192'] as const;
export type SeriesName = (typeof SERIES_NAMES)[number];
export type SeriesChoice = SeriesName | 'none';

// E3–E24 keep their historical two-digit values (e.g. 2.7, 3.3, 4.7, 8.2), which differ from
// the rounded geometric sequence. Stored as mantissa × 10.
const E24 = [10, 11, 12, 13, 15, 16, 18, 20, 22, 24, 27, 30, 33, 36, 39, 43, 47, 51, 56, 62, 68, 75, 82, 91];
const E12 = [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82];
const E6 = [10, 15, 22, 33, 47, 68];
const E3 = [10, 22, 47];

// E48–E192 are the geometric sequence rounded to three digits, with one exception in E192:
// 10^(185/192) rounds to 919, but the standard value is 920. Stored as mantissa × 100.
const E192 = Array.from({ length: 192 }, (_, i) => (i === 185 ? 920 : Math.round(100 * 10 ** (i / 192))));
const E96 = E192.filter((_, i) => i % 2 === 0);
const E48 = E192.filter((_, i) => i % 4 === 0);

interface Table {
  /** Integer mantissas; the value is mantissa / scale × 10^decade. */
  values: readonly number[];
  scale: number;
}

const TABLES: Record<SeriesName, Table> = {
  E3: { values: E3, scale: 10 },
  E6: { values: E6, scale: 10 },
  E12: { values: E12, scale: 10 },
  E24: { values: E24, scale: 10 },
  E48: { values: E48, scale: 100 },
  E96: { values: E96, scale: 100 },
  E192: { values: E192, scale: 100 },
};

/** The series mantissas in [1, 10), e.g. E6 → [1, 1.5, 2.2, 3.3, 4.7, 6.8]. */
export function seriesValues(name: SeriesName): number[] {
  const t = TABLES[name];
  return t.values.map((v) => v / t.scale);
}

/** mantissa × 10^exp computed so that decimal values come out as the nearest double (4.7e-9, not 4.700000000000001e-9). */
function compose(mant: number, scale: number, decade: number): number {
  const digits = Math.round(Math.log10(scale));
  const e = decade - digits;
  return e >= 0 ? mant * 10 ** e : mant / 10 ** -e;
}

/** Nearest series value to x (nearest in ratio, not in absolute difference). */
export function nearest(x: number, name: SeriesChoice): number {
  if (name === 'none' || !(x > 0) || !Number.isFinite(x)) return x;
  const t = TABLES[name];
  const decade = Math.floor(Math.log10(x));
  let best = x;
  let bestErr = Infinity;
  for (const d of [decade - 1, decade, decade + 1]) {
    for (const m of t.values) {
      const v = compose(m, t.scale, d);
      const err = Math.abs(Math.log(v / x));
      if (err < bestErr) {
        bestErr = err;
        best = v;
      }
    }
  }
  return best;
}

/** True when x is a member of the series (within a relative tolerance). */
export function inSeries(x: number, name: SeriesChoice, relTol = 1e-6): boolean {
  if (name === 'none') return true;
  const n = nearest(x, name);
  return Math.abs(n / x - 1) <= relTol;
}

/** All series values in [lo, hi], ascending. */
export function valuesInRange(name: SeriesName, lo: number, hi: number): number[] {
  const t = TABLES[name];
  const out: number[] = [];
  const d0 = Math.floor(Math.log10(lo)) - 1;
  const d1 = Math.floor(Math.log10(hi)) + 1;
  for (let d = d0; d <= d1; d++) {
    for (const m of t.values) {
      const v = compose(m, t.scale, d);
      if (v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9)) out.push(v);
    }
  }
  return out;
}

export interface RatioPair {
  top: number;
  bottom: number;
  /** Achieved top / bottom. */
  ratio: number;
  /** ratio / target − 1 */
  err: number;
}

/**
 * Pick top and bottom values from a series so that top / bottom is as close as possible to
 * `ratio`. `bottom` is searched over [bottomMin, bottomMax]; ties go to the bottom value closest
 * to `bottomPreferred` (in ratio).
 */
export function bestRatio(
  ratio: number,
  name: SeriesChoice,
  opts: { bottomMin?: number; bottomMax?: number; bottomPreferred?: number } = {},
): RatioPair {
  const { bottomMin = 1e3, bottomMax = 100e3, bottomPreferred = 10e3 } = opts;
  if (name === 'none') {
    const bottom = bottomPreferred;
    return { top: ratio * bottom, bottom, ratio, err: 0 };
  }
  let best: RatioPair | null = null;
  let bestPref = Infinity;
  for (const bottom of valuesInRange(name, bottomMin, bottomMax)) {
    const top = nearest(ratio * bottom, name);
    const r = top / bottom;
    const err = r / ratio - 1;
    const pref = Math.abs(Math.log(bottom / bottomPreferred));
    if (
      !best ||
      Math.abs(err) < Math.abs(best.err) - 1e-12 ||
      (Math.abs(Math.abs(err) - Math.abs(best.err)) <= 1e-12 && pref < bestPref)
    ) {
      best = { top, bottom, ratio: r, err };
      bestPref = pref;
    }
  }
  return best!;
}

export interface PairResult {
  a: number;
  b: number;
  value: number;
  err: number;
}

/**
 * Two series values whose series or parallel combination best approximates `target`. Useful
 * when a single series value is not close enough.
 */
export function bestPair(target: number, name: SeriesName, mode: 'series' | 'parallel'): PairResult {
  const combine =
    mode === 'series' ? (a: number, b: number) => a + b : (a: number, b: number) => (a * b) / (a + b);
  const lo = mode === 'series' ? target / 1000 : target;
  const hi = mode === 'series' ? target : target * 1000;
  let best: PairResult = { a: nearest(target, name), b: 0, value: nearest(target, name), err: Infinity };
  best.err = best.value / target - 1;
  const candidates = valuesInRange(name, lo, hi);
  for (const a of candidates) {
    const remainder = mode === 'series' ? target - a : (target * a) / (a - target);
    if (!(remainder > 0) || !Number.isFinite(remainder)) continue;
    const b = nearest(remainder, name);
    const value = combine(a, b);
    const err = value / target - 1;
    if (Math.abs(err) < Math.abs(best.err) - 1e-12)
      best = { a: Math.max(a, b), b: Math.min(a, b), value, err };
  }
  return best;
}
