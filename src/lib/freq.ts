// Frequency sweeps and transfer-function evaluation.

import type { Complex } from './complex';
import { jw } from './complex';

/** n points from a to b spaced evenly on a log scale (inclusive). */
export function logspace(a: number, b: number, n: number): number[] {
  const la = Math.log10(a);
  const lb = Math.log10(b);
  return Array.from({ length: n }, (_, i) => 10 ** (la + ((lb - la) * i) / (n - 1)));
}

/** n points from a to b spaced evenly (inclusive). */
export function linspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}

export const toDb = (mag: number): number => 20 * Math.log10(mag);
export const fromDb = (db: number): number => 10 ** (db / 20);
export const deg = (rad: number): number => (rad * 180) / Math.PI;

export interface Response {
  f: number[];
  /** Magnitude in dB. */
  db: number[];
  /** Phase in degrees, unwrapped so it is continuous across the sweep. */
  phase: number[];
}

/** Unwrap a phase sequence in degrees so neighbouring points never jump by more than 180°. */
export function unwrap(phase: number[]): number[] {
  const out: number[] = [];
  let offset = 0;
  for (let i = 0; i < phase.length; i++) {
    if (i > 0) {
      const d = phase[i]! + offset - out[i - 1]!;
      if (d > 180) offset -= 360;
      else if (d < -180) offset += 360;
    }
    out.push(phase[i]! + offset);
  }
  return out;
}

/** Evaluate H(s) at s = jω over the given frequencies. */
export function evaluate(H: (s: Complex) => Complex, f: number[]): Response {
  const vals = f.map((fi) => H(jw(fi)));
  return {
    f,
    db: vals.map((v) => toDb(v.abs())),
    phase: unwrap(vals.map((v) => deg(v.arg()))),
  };
}

/** Sweep range of `decades` either side of a centre frequency, rounded out to whole decades. */
export function sweepAround(fCentre: number, decadesBelow = 2, decadesAbove = 2): [number, number] {
  const lc = Math.log10(fCentre);
  return [10 ** Math.floor(lc - decadesBelow), 10 ** Math.ceil(lc + decadesAbove)];
}

/**
 * First frequency (searching upward) where g(f) crosses zero, refined by bisection on a log
 * scale. Returns NaN if there is no crossing in [f1, f2].
 */
export function findCrossing(g: (f: number) => number, f1: number, f2: number, steps = 400): number {
  const fs = logspace(f1, f2, steps);
  let prevF = fs[0]!;
  let prev = g(prevF);
  for (let i = 1; i < fs.length; i++) {
    const f = fs[i]!;
    const v = g(f);
    if (prev === 0) return prevF;
    if (Math.sign(v) !== Math.sign(prev)) {
      let lo = prevF;
      let hi = f;
      let glo = prev;
      for (let k = 0; k < 60; k++) {
        const mid = Math.sqrt(lo * hi);
        const gm = g(mid);
        if (Math.sign(gm) === Math.sign(glo)) {
          lo = mid;
          glo = gm;
        } else hi = mid;
      }
      return Math.sqrt(lo * hi);
    }
    prevF = f;
    prev = v;
  }
  return NaN;
}
