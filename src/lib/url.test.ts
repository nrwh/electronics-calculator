import { describe, expect, it } from 'vitest';
import rc from '../calculators/rc-lowpass/index';
import type { AnyCalculatorDef } from '../calculators/types';
import { DEFAULT_SETTINGS } from '../ui/settings';
import { partTypes, readState, writeState } from './url';

const def: AnyCalculatorDef = rc;

describe('URL state', () => {
  it('reads defaults from an empty query', () => {
    const s = readState(def, '', DEFAULT_SETTINGS);
    expect(s.solve).toBe('R');
    expect(s.raw).toEqual({ fc: '1k', R: '10k', C: '10n', f: '10k' });
    expect(s.settings).toEqual(DEFAULT_SETTINGS);
    expect(s.tab).toBeNull();
  });

  it('round-trips solve, inputs, series, tolerance and tab', () => {
    const q = '?solve=fc&R=4k7&C=2.2u&f=50&eR=E96&eC=E6&tR=0.1&tC=10&tab=spice&v=1';
    const s = readState(def, q, DEFAULT_SETTINGS);
    expect(s.solve).toBe('fc');
    expect(s.raw.R).toBe('4k7');
    expect(s.settings.series.R).toBe('E96');
    expect(s.settings.tol.C).toBe(10);
    expect(s.tab).toBe('spice');
    const again = readState(def, writeState(def, s), DEFAULT_SETTINGS);
    expect(again).toEqual(s);
  });

  it('writes inputs only, never solved values, and only the part types used', () => {
    const s = readState(def, '?solve=R&fc=2k&R=999&C=1n', DEFAULT_SETTINGS);
    const q = new URLSearchParams(writeState(def, s));
    expect(q.get('fc')).toBe('2k');
    expect(q.has('R')).toBe(false);
    expect(q.has('eL')).toBe(false);
    expect(q.get('eR')).toBe('E24');
    expect(q.get('v')).toBe('1');
    expect(partTypes(def)).toEqual(['R', 'C']);
  });

  it('ignores invalid settings and unknown options', () => {
    const s = readState(def, '?solve=nope&eR=E7&tC=-5&tab=bogus', DEFAULT_SETTINGS);
    expect(s.solve).toBe('R');
    expect(s.settings.series.R).toBe('E24');
    expect(s.settings.tol.C).toBe(5);
    expect(s.tab).toBeNull();
  });

  it('migrates old links', () => {
    const migrating: AnyCalculatorDef = {
      ...def,
      urlVersion: 2,
      migrate(q, from) {
        if (from < 2 && q.has('fcut')) q.set('fc', q.get('fcut')!);
        return q;
      },
    };
    const s = readState(migrating, '?fcut=3k&v=1', DEFAULT_SETTINGS);
    expect(s.raw.fc).toBe('3k');
  });
});
