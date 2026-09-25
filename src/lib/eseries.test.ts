import { describe, expect, it } from 'vitest';
import { bestPair, bestRatio, inSeries, nearest, seriesValues, valuesInRange } from './eseries';

// Reference tables from IEC 60063.
const IEC_E24 = [
  1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8,
  7.5, 8.2, 9.1,
];
const IEC_E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
const IEC_E6 = [1.0, 1.5, 2.2, 3.3, 4.7, 6.8];
const IEC_E3 = [1.0, 2.2, 4.7];
const IEC_E48 = [
  100, 105, 110, 115, 121, 127, 133, 140, 147, 154, 162, 169, 178, 187, 196, 205, 215, 226, 237, 249, 261,
  274, 287, 301, 316, 332, 348, 365, 383, 402, 422, 442, 464, 487, 511, 536, 562, 590, 619, 649, 681, 715,
  750, 787, 825, 866, 909, 953,
];
const IEC_E96 = [
  100, 102, 105, 107, 110, 113, 115, 118, 121, 124, 127, 130, 133, 137, 140, 143, 147, 150, 154, 158, 162,
  165, 169, 174, 178, 182, 187, 191, 196, 200, 205, 210, 215, 221, 226, 232, 237, 243, 249, 255, 261, 267,
  274, 280, 287, 294, 301, 309, 316, 324, 332, 340, 348, 357, 365, 374, 383, 392, 402, 412, 422, 432, 442,
  453, 464, 475, 487, 499, 511, 523, 536, 549, 562, 576, 590, 604, 619, 634, 649, 665, 681, 698, 715, 732,
  750, 768, 787, 806, 825, 845, 866, 887, 909, 931, 953, 976,
];
// Every other E192 value (the ones not in E96), including the 920 exception.
const IEC_E192_ODD = [
  101, 104, 106, 109, 111, 114, 117, 120, 123, 126, 129, 132, 135, 138, 142, 145, 149, 152, 156, 160, 164,
  167, 172, 176, 180, 184, 189, 193, 198, 203, 208, 213, 218, 223, 229, 234, 240, 246, 252, 258, 264, 271,
  277, 284, 291, 298, 305, 312, 320, 328, 336, 344, 352, 361, 370, 379, 388, 397, 407, 417, 427, 437, 448,
  459, 470, 481, 493, 505, 517, 530, 542, 556, 569, 583, 597, 612, 626, 642, 657, 673, 690, 706, 723, 741,
  759, 777, 796, 816, 835, 856, 876, 898, 920, 942, 965, 988,
];

describe('series tables', () => {
  it('E3–E24 match IEC 60063, including the legacy two-digit values', () => {
    expect(seriesValues('E24')).toEqual(IEC_E24);
    expect(seriesValues('E12')).toEqual(IEC_E12);
    expect(seriesValues('E6')).toEqual(IEC_E6);
    expect(seriesValues('E3')).toEqual(IEC_E3);
    // The legacy values differ from rounding 10^(i/24).
    for (const v of [2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 8.2]) expect(IEC_E24).toContain(v);
  });

  it('E48, E96 and E192 match IEC 60063', () => {
    expect(seriesValues('E48')).toEqual(IEC_E48.map((v) => v / 100));
    expect(seriesValues('E96')).toEqual(IEC_E96.map((v) => v / 100));
    const e192 = seriesValues('E192');
    expect(e192).toHaveLength(192);
    expect(e192.filter((_, i) => i % 2 === 0)).toEqual(IEC_E96.map((v) => v / 100));
    expect(e192.filter((_, i) => i % 2 === 1)).toEqual(IEC_E192_ODD.map((v) => v / 100));
    expect(e192).toContain(9.2);
    expect(e192).not.toContain(9.19);
  });
});

describe('nearest', () => {
  it('snaps in ratio across decades', () => {
    expect(nearest(15915.5, 'E24')).toBe(16000);
    expect(nearest(15915.5, 'E12')).toBe(15000);
    expect(nearest(9.6, 'E24')).toBe(10);
    expect(nearest(0.0000000047, 'E12')).toBe(4.7e-9);
    expect(nearest(1.04e-9, 'E6')).toBe(1e-9);
    expect(nearest(1234, 'E96')).toBe(1240);
    expect(nearest(9195, 'E192')).toBe(9200);
  });
  it('returns exact decimal doubles', () => {
    expect(nearest(4.69e-9, 'E24')).toBe(4.7e-9);
    expect(nearest(0.33e-6, 'E12')).toBe(0.33e-6);
    expect(nearest(2.2e3, 'E3')).toBe(2200);
  });
  it('leaves the value alone for "none"', () => {
    expect(nearest(1234.5, 'none')).toBe(1234.5);
  });
  it('snaps a geometric midpoint either way consistently', () => {
    const mid = Math.sqrt(1 * 1.2);
    expect([1, 1.2]).toContain(nearest(mid, 'E12'));
  });
});

describe('inSeries and valuesInRange', () => {
  it('detects membership', () => {
    expect(inSeries(4700, 'E12')).toBe(true);
    expect(inSeries(4990, 'E12')).toBe(false);
    expect(inSeries(4990, 'E96')).toBe(true);
    expect(inSeries(123, 'none')).toBe(true);
  });
  it('lists values in a range', () => {
    expect(valuesInRange('E6', 1e3, 10e3)).toEqual([1000, 1500, 2200, 3300, 4700, 6800, 10000]);
  });
});

describe('bestRatio', () => {
  it('finds a divider for 3.3 V from 0.8 V (ratio 3.125) in E24', () => {
    const r = bestRatio(3.3 / 0.8 - 1, 'E24');
    expect(Math.abs(r.err)).toBeLessThan(0.01);
    expect(inSeries(r.top, 'E24')).toBe(true);
    expect(inSeries(r.bottom, 'E24')).toBe(true);
    expect(r.ratio).toBeCloseTo(r.top / r.bottom, 12);
  });
  it('finds an exact ratio when one exists', () => {
    const r = bestRatio(2, 'E24');
    expect(r.err).toBe(0);
    expect(r.bottom).toBe(10e3);
  });
  it('respects the bottom range', () => {
    const r = bestRatio(4.2, 'E24', { bottomMin: 1e3, bottomMax: 2e3 });
    expect(r.bottom).toBeGreaterThanOrEqual(1e3);
    expect(r.bottom).toBeLessThanOrEqual(2e3);
  });
});

describe('bestPair', () => {
  it('improves on a single E12 value with two in series', () => {
    const single = Math.abs(nearest(14e3, 'E12') / 14e3 - 1);
    const p = bestPair(14e3, 'E12', 'series');
    expect(Math.abs(p.err)).toBeLessThan(single);
    expect(p.value).toBeCloseTo(p.a + p.b, 9);
  });
  it('works in parallel', () => {
    const p = bestPair(7.5e3, 'E6', 'parallel');
    expect(Math.abs(p.err)).toBeLessThan(0.05);
  });
});
