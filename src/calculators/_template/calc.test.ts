// Renamed to <id>.test.ts by `npm run new-calc`. The shared contract test
// (src/calculators/contract.test.ts) already checks defaults, rendering and round trips; add
// hand-calculated reference values for every solve option here.

import { describe, expect, it } from 'vitest';
import { runPipeline } from '../../lib/pipeline';
import { DEFAULT_SETTINGS } from '../../ui/settings';
import def from './index';

describe('__TITLE__', () => {
  it('solves the default option against a hand-calculated value', () => {
    const r = runPipeline(def, 'R2', { Vin: '12', Vout: '3', R1: '9k' }, DEFAULT_SETTINGS);
    expect(r.ok).toBe(true);
    // R2 = 9k · 3 / (12 − 3) = 3 kΩ, which is in E24.
    expect(r.solved.R2!.ideal).toBeCloseTo(3000, 9);
    expect(r.solved.R2!.value).toBe(3000);
  });

  it('reports errors against the field', () => {
    const r = runPipeline(def, 'R2', { Vin: '5', Vout: '6', R1: '10k' }, DEFAULT_SETTINGS);
    expect(r.fieldErrors.Vout).toBeDefined();
  });
});
