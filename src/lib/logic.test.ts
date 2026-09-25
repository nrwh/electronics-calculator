import { describe, expect, it } from 'vitest';
import { evaluate, formatSop, literalCount, minimise, primeImplicants, type Tri } from './logic';

const fromOnes = (n: number, ones: number[], dc: number[] = []): Tri[] =>
  Array.from({ length: 1 << n }, (_, m) => (ones.includes(m) ? 1 : dc.includes(m) ? 'x' : 0));

describe('logic minimiser', () => {
  it('handles constants', () => {
    expect(minimise(fromOnes(2, []), 2)).toEqual([]);
    expect(minimise(fromOnes(2, [0, 1, 2, 3]), 2)).toEqual([{ mask: 0, value: 0 }]);
  });

  it('finds the prime implicants of a classic example', () => {
    // f(A,B,C) = Σm(0,1,2,5,6,7): primes are A̅B̅, A̅C̅, B̅C, BC̅, AC, AB
    const primes = primeImplicants(fromOnes(3, [0, 1, 2, 5, 6, 7]), 3);
    expect(primes).toHaveLength(6);
    // Its minimum cover needs 3 terms (a cyclic core).
    const sop = minimise(fromOnes(3, [0, 1, 2, 5, 6, 7]), 3);
    expect(sop).toHaveLength(3);
  });

  it('uses don’t-cares', () => {
    // BCD "≥ 5" detector: f = Σm(5..9), don't care 10..15 → A + BD + BC
    const sop = minimise(fromOnes(4, [5, 6, 7, 8, 9], [10, 11, 12, 13, 14, 15]), 4);
    expect(sop).toHaveLength(3);
    expect(sop.reduce((s, p) => s + literalCount(p), 0)).toBe(5);
  });

  it('always reproduces the specified function (exhaustive 3-variable check)', () => {
    for (let f = 0; f < 256; f++) {
      const table = fromOnes(
        3,
        Array.from({ length: 8 }, (_, m) => m).filter((m) => f & (1 << m)),
      );
      const sop = minimise(table, 3);
      for (let m = 0; m < 8; m++) expect(evaluate(sop, m)).toBe(table[m]);
    }
  });

  it('respects don’t-cares on random 4-variable functions', () => {
    let seed = 12345;
    const rnd = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff), seed / 0x7fffffff);
    for (let k = 0; k < 200; k++) {
      const table: Tri[] = Array.from({ length: 16 }, () => {
        const r = rnd();
        return r < 0.4 ? 0 : r < 0.8 ? 1 : 'x';
      });
      const sop = minimise(table, 4);
      table.forEach((t, m) => {
        if (t !== 'x') expect(evaluate(sop, m)).toBe(t);
      });
    }
  });

  it('formats with Q̅ for complemented variables, highest bit first', () => {
    const sop = minimise(fromOnes(2, [1]), 2); // Q̅1·Q0
    expect(formatSop(sop, ['Q0', 'Q1'])).toBe('Q̅1·Q0');
    expect(formatSop([], ['Q0'])).toBe('0');
    expect(formatSop([{ mask: 0, value: 0 }], ['Q0'])).toBe('1');
  });
});
