import { describe, expect, it } from 'vitest';
import { jw } from '../../lib/complex';
import { runPipeline } from '../../lib/pipeline';
import { isUnavailable } from '../../lib/spice';
import { DEFAULT_SETTINGS } from '../../ui/settings';
import type { Settings } from '../types';
import def, { beta, diodeAmplitude, realFrequency, type Out } from './index';

const exact: Settings = { ...structuredClone(DEFAULT_SETTINGS), series: { R: 'none', C: 'none', L: 'none' } };
const base = { method: 'diodes', margin: '5', Rg: '10k', vpk: '3', vd: '0.6', gbw: '1M', vsat: '12' };

describe('Wien bridge oscillator', () => {
  it('solves R, C and f0 (hand-calculated)', () => {
    // f0 = 1/(2π·10k·10n) = 1591.55 Hz
    const f = runPipeline(def, 'f0', { ...base, R: '10k', C: '10n' }, exact);
    expect(f.values!.f0 as number).toBeCloseTo(1591.549, 2);
    const r = runPipeline(def, 'R', { ...base, f0: '1k', C: '10n' }, DEFAULT_SETTINGS);
    expect(r.solved.R!.ideal).toBeCloseTo(15915.49, 1);
    expect(r.solved.R!.value).toBe(16e3);
    const c = runPipeline(def, 'C', { ...base, f0: '1k', R: '10k' }, DEFAULT_SETTINGS);
    expect(c.solved.C!.value).toBe(15e-9);
  });

  it('has β = 1/3 with zero phase at f0', () => {
    const f0 = 1 / (2 * Math.PI * 10e3 * 10e-9);
    const b = beta(10e3, 10e-9, jw(f0));
    expect(b.abs()).toBeCloseTo(1 / 3, 12);
    expect(b.arg()).toBeCloseTo(0, 12);
  });

  it('sets the start-up gain from the margin', () => {
    const r = runPipeline(def, 'f0', { ...base, R: '10k', C: '10n', method: 'ntc', margin: '5' }, exact);
    const o = r.out as Out;
    expect(o.gainStart).toBeCloseTo(3.15, 9);
    expect(o.rf).toBeCloseTo(21.5e3, 6);
  });

  it('shifts f0 down slightly with a finite GBW, and not at all with a very fast op-amp', () => {
    const f0 = 1 / (2 * Math.PI * 16e3 * 10e-9);
    const slow = realFrequency(16e3, 10e-9, { a0: 1e5, gbw: 1e6, vmax: 12, vmin: -12 });
    const fast = realFrequency(16e3, 10e-9, { a0: 1e7, gbw: 1e12, vmax: 12, vmin: -12 });
    expect(slow).toBeLessThan(f0);
    expect(slow / f0).toBeGreaterThan(0.98);
    expect(fast / f0).toBeCloseTo(1, 5);
  });

  it('designs the diode network for the target amplitude', () => {
    const r = runPipeline(def, 'f0', { ...base, R: '10k', C: '10n', vpk: '4' }, exact);
    const o = r.out as Out;
    // Rf1 + Rf2 = (2 + 3·0.05)·Rg = 21.5 kΩ. The hard-clamp estimate Rg·(2 − 3·0.6/4) = 15.5 kΩ is
    // a lower bound: soft diodes conduct early, so a larger Rf1 is needed.
    expect(o.rf1 + o.rf2).toBeCloseTo(21.5e3, 6);
    expect(o.rf1).toBeGreaterThan(15.5e3);
    expect(o.rf1).toBeLessThan(20e3);
    // Unsnapped, the design hits the target amplitude.
    expect(o.amplitude).toBeCloseTo(4, 4);
    expect(r.compare.find((c) => c.key === 'vpk')).toBeDefined();
  });

  it('gives a larger amplitude with less diode shunting', () => {
    expect(diodeAmplitude(10e3, 18e3, 3e3, 0.6)).toBeGreaterThan(diodeAmplitude(10e3, 15e3, 6e3, 0.6));
  });

  it('rejects an amplitude below 1.5·V_D and a margin that snaps to a gain of 3 or less', () => {
    expect(
      runPipeline(def, 'f0', { ...base, R: '10k', C: '10n', vpk: '0.8' }, exact).fieldErrors.vpk,
    ).toBeDefined();
    const r = runPipeline(
      def,
      'f0',
      { ...base, R: '10k', C: '10n', method: 'ntc', margin: '0.5', Rg: '10k' },
      DEFAULT_SETTINGS,
    );
    // 2.015·10k = 20.15k snaps to 20k in E24: the gain is exactly 3.
    expect(r.fieldErrors.margin).toBeDefined();
  });

  it('gives a netlist only for diode stabilisation', () => {
    for (const method of ['jfet', 'ntc', 'lamp']) {
      const r = runPipeline(def, 'R', { ...base, f0: '1k', C: '10n', method }, DEFAULT_SETTINGS);
      expect(isUnavailable(def.spice!(r.values as never, r.out as Out))).toBe(true);
    }
  });
});
