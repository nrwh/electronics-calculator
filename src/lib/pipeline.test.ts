import { describe, expect, it } from 'vitest';
import { part, qty, type Settings } from '../calculators/types';
import { snapPartText } from './pipeline';

const settings: Settings = {
  series: { R: 'E12', C: 'E6', L: 'none' },
  tol: { R: 1, C: 5, L: 20 },
};
const R = part('R', { label: 'R', default: '1k' });
const C = part('C', { label: 'C', default: '10n' });
const L = part('L', { label: 'L', default: '10u' });

describe('snapPartText', () => {
  it('snaps a typed part to the nearest series value', () => {
    expect(snapPartText(R, '1.4k', settings)).toBe('1.5k');
    expect(snapPartText(R, '5k', settings)).toBe('4.7k');
    expect(snapPartText(C, '90n', settings)).toBe('100n');
  });

  it('leaves values already in the series alone', () => {
    expect(snapPartText(R, '4.7k', settings)).toBeNull();
    expect(snapPartText(R, '4k7', settings)).toBeNull();
  });

  it('does nothing without a series, for bad text or for non-parts', () => {
    expect(snapPartText(L, '12.3u', settings)).toBeNull();
    expect(snapPartText(R, 'abc', settings)).toBeNull();
    expect(snapPartText(R, '', settings)).toBeNull();
    expect(snapPartText(qty({ label: 'f', unit: 'Hz', default: '1k' }), '1.4k', settings)).toBeNull();
  });
});
