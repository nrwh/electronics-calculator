import { describe, expect, it } from 'vitest';
import { jw } from '../../lib/complex';
import { runPipeline } from '../../lib/pipeline';
import { DEFAULT_SETTINGS } from '../../ui/settings';
import type { Settings } from '../types';
import def, { closedLoop, idealH, noiseGain, phaseMargin, type Out } from './index';

const exact: Settings = { ...structuredClone(DEFAULT_SETTINGS), series: { R: 'none', C: 'none', L: 'none' } };
const base = { gbw: '10M', vsat: '12', vin: '1', fin: '500' };

describe('Differentiator', () => {
  it('solves the parts from f_a, f_b and C (hand-calculated)', () => {
    const r = runPipeline(def, 'parts', { ...base, fa: '1k', fb: '20k', C: '10n' }, exact);
    expect(r.ok).toBe(true);
    // Rf = 1/(2π·1k·10n) = 15.915 kΩ; R1 = 1/(2π·20k·10n) = 795.8 Ω; Cf = R1·C/Rf = 500 pF
    expect(r.solved.Rf!.ideal).toBeCloseTo(15915.49, 1);
    expect(r.solved.R1!.ideal).toBeCloseTo(795.775, 2);
    expect(r.solved.Cf!.ideal).toBeCloseTo(500e-12, 15);
  });

  it('snaps the parts and reports achieved f_a and f_b', () => {
    const r = runPipeline(def, 'parts', { ...base, fa: '1k', fb: '20k', C: '10n' }, DEFAULT_SETTINGS);
    expect(r.solved.Rf!.value).toBe(16e3);
    expect(r.solved.R1!.value).toBe(820);
    expect(r.solved.Cf!.value).toBe(470e-12);
    const fa = r.compare.find((c) => c.key === 'fa')!;
    expect(fa.achieved).toBeCloseTo(1 / (2 * Math.PI * 16e3 * 10e-9), 6);
  });

  it('solves the frequencies from the parts', () => {
    const r = runPipeline(def, 'freqs', { ...base, Rf: '10k', R1: '470', Cf: '470p', C: '10n' }, exact);
    expect(r.values!.fa as number).toBeCloseTo(1591.549, 2);
    expect(r.values!.fb as number).toBeCloseTo(33862.75, 1);
  });

  it('has a closed-loop gain of fb/fa/2 at f_b with coincident poles', () => {
    const p = { Rf: 20e3, R1: 1e3, Cf: 500e-12, C: 10e-9 };
    const fb = 1 / (2 * Math.PI * 1e3 * 10e-9);
    expect(idealH(p, jw(fb)).abs()).toBeCloseTo(10, 9);
    // At f_b the noise gain is 1 + fb/fa/2 = 11; far above it, it returns to 1.
    expect(noiseGain(p, jw(fb)).abs()).toBeCloseTo(11, 9);
    expect(noiseGain(p, jw(1e12)).abs()).toBeCloseTo(1, 3);
    // A very fast op-amp approaches the ideal response.
    const op = { a0: 1e9, gbw: 1e15, vmax: 12, vmin: -12 };
    expect(closedLoop(p, op, jw(fb)).abs()).toBeCloseTo(10, 4);
  });

  it('has little phase margin when the op-amp meets the rising noise gain, and finds the minimum GBW for 60°', () => {
    const p = { Rf: 16e3, R1: 820, Cf: 470e-12, C: 10e-9 };
    // GBW 10 kHz meets the noise gain on its rising slope, well below f_b: marginal.
    expect(phaseMargin(p, { a0: 1e5, gbw: 10e3, vmax: 12, vmin: -12 }).pm).toBeLessThan(40);
    // Without R1 and Cf (the ideal differentiator) there is almost no margin at all.
    expect(
      phaseMargin({ ...p, R1: 1e-3, Cf: 1e-18 }, { a0: 1e5, gbw: 1e6, vmax: 12, vmin: -12 }).pm,
    ).toBeLessThan(5);
    expect(phaseMargin(p, { a0: 1e5, gbw: 10e6, vmax: 12, vmin: -12 }).pm).toBeGreaterThan(60);
    const r = runPipeline(
      def,
      'freqs',
      { ...base, Rf: '16k', R1: '820', Cf: '470p', C: '10n' },
      DEFAULT_SETTINGS,
    );
    const o = r.out as Out;
    expect(phaseMargin(p, { a0: 1e5, gbw: o.gbwMin, vmax: 12, vmin: -12 }).pm).toBeCloseTo(60, 2);
  });

  it('rejects f_b ≤ f_a and warns about separated poles and low phase margin', () => {
    expect(
      runPipeline(def, 'parts', { ...base, fa: '10k', fb: '5k', C: '10n' }, exact).fieldErrors.fb,
    ).toBeDefined();
    const sep = runPipeline(def, 'freqs', { ...base, Rf: '10k', R1: '470', Cf: '4.7n', C: '10n' }, exact);
    expect(sep.warnings.some((w) => /poles have separated/.test(w.message))).toBe(true);
    const slow = runPipeline(def, 'parts', { ...base, gbw: '100k', fa: '100', fb: '20k', C: '100n' }, exact);
    expect(slow.warnings.some((w) => w.field === 'gbw')).toBe(true);
  });

  it('warns when the output would clip', () => {
    const r = runPipeline(
      def,
      'parts',
      { ...base, vin: '5', fin: '15k', fa: '1k', fb: '20k', C: '10n' },
      exact,
    );
    expect(r.warnings.some((w) => w.field === 'vin')).toBe(true);
  });
});
