// Modulo-N synchronous down counter with D flip-flops: next-state logic, self-start check and
// gate-level timing.

import { type Implicant, type Tri, evaluate, literalCount, minimise } from '../../lib/logic';

export interface UnusedState {
  state: number;
  next: number;
  /** Clock edges until the counter is in the counting sequence. */
  steps: number;
}

export interface CounterDesign {
  n: number;
  /** Number of flip-flops. */
  k: number;
  /** Count order from the initial state N − 1: N−1, N−2, …, 0. */
  sequence: number[];
  /** D input of each flip-flop (bit i), as a minimal sum of products of Q and Q̅. */
  equations: Implicant[][];
  /** Next state of every state, as the minimised logic computes it. */
  next: number[];
  unused: UnusedState[];
  /** Unused states whose next state had to be assigned to break a lockout cycle. */
  assigned: number[];
}

export function flipFlopsFor(n: number): number {
  return Math.max(1, Math.ceil(Math.log2(n)));
}

/** Design the counter. Unused states are don't-cares unless one would lock out. */
export function designDownCounter(n: number): CounterDesign {
  const k = flipFlopsFor(n);
  const size = 1 << k;
  const want: (number | null)[] = Array.from({ length: size }, (_, s) =>
    s < n ? (s === 0 ? n - 1 : s - 1) : null,
  );
  const assigned: number[] = [];

  for (let attempt = 0; attempt <= size; attempt++) {
    const equations = Array.from({ length: k }, (_, bit) => {
      const table: Tri[] = want.map((ns) => (ns === null ? 'x' : (((ns >> bit) & 1) as 0 | 1)));
      return minimise(table, k);
    });
    const next = Array.from({ length: size }, (_, s) =>
      equations.reduce((acc, eq, bit) => acc | (evaluate(eq, s) << bit), 0),
    );
    // Follow each unused state until it reaches the sequence, or revisits a state (lockout).
    const unused: UnusedState[] = [];
    const locked: number[] = [];
    for (let s = n; s < size; s++) {
      const seen = new Set<number>();
      let cur = s;
      let steps = 0;
      while (cur >= n && !seen.has(cur)) {
        seen.add(cur);
        cur = next[cur]!;
        steps++;
      }
      if (cur >= n) locked.push(s);
      else unused.push({ state: s, next: next[s]!, steps });
    }
    if (!locked.length) {
      return {
        n,
        k,
        sequence: Array.from({ length: n }, (_, i) => n - 1 - i),
        equations,
        next,
        unused,
        assigned,
      };
    }
    // Break the lockout: send the lowest locked state straight to N − 1, then minimise again.
    const s = Math.min(...locked);
    want[s] = n - 1;
    assigned.push(s);
  }
  throw new Error('Could not remove lockout');
}

/** Period (in clocks) and duty cycle of bit i over the counting sequence. */
export function bitWaveform(
  d: CounterDesign,
  bit: number,
): { period: number; duty: number; values: (0 | 1)[] } {
  const values = d.sequence.map((s) => ((s >> bit) & 1) as 0 | 1);
  let period = d.n;
  for (let p = 1; p < d.n; p++) {
    if (d.n % p === 0 && values.every((v, i) => v === values[i % p])) {
      period = p;
      break;
    }
  }
  const ones = values.slice(0, period).filter((v) => v === 1).length;
  return { period, duty: ones / period, values };
}

export interface GateTree {
  /** AND levels (2-input gates) before the OR tree, per bit, for the slowest term. */
  andLevels: number;
  orLevels: number;
  ands: number;
  ors: number;
}

const depth = (inputs: number): number => (inputs <= 1 ? 0 : Math.ceil(Math.log2(inputs)));

/** Gate levels and counts for one D equation built from 2-input ANDs and ORs. */
export function gateTree(eq: Implicant[]): GateTree {
  if (eq.length === 0 || (eq.length === 1 && eq[0]!.mask === 0))
    return { andLevels: 0, orLevels: 0, ands: 0, ors: 0 };
  let andLevels = 0;
  let ands = 0;
  for (const term of eq) {
    const n = literalCount(term);
    andLevels = Math.max(andLevels, depth(n));
    ands += Math.max(0, n - 1);
  }
  return { andLevels, orLevels: depth(eq.length), ands, ors: Math.max(0, eq.length - 1) };
}

export interface Timing {
  /** Clock to Q, AND gate and OR gate propagation delays, and set-up time (seconds). */
  tcq: number;
  tand: number;
  tor: number;
  tsu: number;
}

export interface PathTiming {
  /** Worst-case delay from clock edge to D input settling. */
  logicDelay: number;
  levels: number;
  fmax: number;
  ands: number;
  ors: number;
}

export function pathTiming(d: CounterDesign, t: Timing): PathTiming {
  let logicDelay = 0;
  let levels = 0;
  let ands = 0;
  let ors = 0;
  for (const eq of d.equations) {
    const g = gateTree(eq);
    logicDelay = Math.max(logicDelay, g.andLevels * t.tand + g.orLevels * t.tor);
    levels = Math.max(levels, g.andLevels + g.orLevels);
    ands += g.ands;
    ors += g.ors;
  }
  return { logicDelay, levels, fmax: 1 / (t.tcq + logicDelay + t.tsu), ands, ors };
}
