import { describe, expect, it } from 'vitest';
import { runPipeline } from '../../lib/pipeline';
import { DEFAULT_SETTINGS } from '../../ui/settings';
import type { Settings } from '../types';
import def, { type Out } from './index';

const settings: Settings = structuredClone(DEFAULT_SETTINGS);
const exact: Settings = { ...structuredClone(DEFAULT_SETTINGS), series: { R: 'none', C: 'none', L: 'none' } };

const run = (solve: string, raw: Record<string, string>, s = settings) => runPipeline(def, solve, raw, s);

describe('RC low-pass', () => {
  it('solves fc from R and C (hand-calculated reference)', () => {
    const r = run('fc', { R: '10k', C: '15.9n', f: '10k' });
    expect(r.ok).toBe(true);
    // 1 / (2π · 10 kΩ · 15.9 nF) = 1000.97 Hz
    expect(r.values!.fc).toBeCloseTo(1000.97, 2);
    expect((r.out as Out).tau).toBeCloseTo(159e-6, 12);
  });

  it('solves R from fc and C, snapping to E24', () => {
    const r = run('R', { fc: '1k', C: '10n', f: '10k' });
    expect(r.ok).toBe(true);
    expect(r.solved.R!.ideal).toBeCloseTo(15915.494, 3);
    expect(r.solved.R!.value).toBe(16000);
    expect(r.solved.R!.err).toBeCloseTo(16000 / r.solved.R!.ideal - 1, 12);
    const cmp = r.compare.find((c) => c.key === 'fc')!;
    expect(cmp.achieved).toBeCloseTo(994.718, 3);
    expect(cmp.err).toBeCloseTo(-0.00528, 5);
  });

  it('solves C from fc and R, snapping to E12', () => {
    const r = run('C', { fc: '1k', R: '10k', f: '10k' });
    expect(r.solved.C!.ideal).toBeCloseTo(15.9155e-9, 13);
    expect(r.solved.C!.value).toBe(15e-9);
  });

  it('round-trips each solve option without snapping', () => {
    const r1 = run('R', { fc: '1234.5', C: '4.7n', f: '1k' }, exact);
    const r2 = run('fc', { R: String(r1.solved.R!.ideal), C: '4.7n', f: '1k' }, exact);
    expect(r2.values!.fc as number).toBeCloseTo(1234.5, 9);
    const r3 = run('C', { fc: '1234.5', R: String(r1.solved.R!.ideal), f: '1k' }, exact);
    expect((r3.values!.C as number) / 4.7e-9).toBeCloseTo(1, 9);
  });

  it('computes the tolerance spread over all corners', () => {
    const r = run('fc', { R: '10k', C: '10n', f: '1k' });
    const fc = 1 / (2 * Math.PI * 10e3 * 10e-9);
    expect(r.spread.fc!.min).toBeCloseTo(fc / (1.01 * 1.05), 6);
    expect(r.spread.fc!.max).toBeCloseTo(fc / (0.99 * 0.95), 6);
  });

  it('computes attenuation and phase at the evaluation frequency', () => {
    const r = run('fc', { R: '10k', C: '10n', f: '1.5915494k' });
    const o = r.out as Out;
    expect(o.dbAtF).toBeCloseTo(-3.0103, 3);
    expect(o.phaseAtF).toBeCloseTo(-45, 3);
    expect(o.rise / o.tau).toBeCloseTo(2.1972, 4);
  });

  it('rejects bad input with a field error', () => {
    expect(run('R', { fc: '0', C: '10n', f: '1k' }).fieldErrors.fc).toMatch(/greater than zero/);
    expect(run('R', { fc: '1k', C: 'abc', f: '1k' }).fieldErrors.C).toMatch(/Enter a number/);
    expect(run('fc', { R: '-1k', C: '10n', f: '1k' }).ok).toBe(false);
  });

  it('notes typed parts that are not in the selected series', () => {
    const r = run('fc', { R: '10.5k', C: '10n', f: '1k' });
    expect(r.offSeries).toEqual(['R']);
  });

  it('builds a netlist with SPICE-safe values', () => {
    const r = run('R', { fc: '1k', C: '10n', f: '10k' });
    const text = def.spice!(r.values as never, r.out as Out).toString();
    expect(text).toMatchInlineSnapshot(`
      "* RC low-pass filter
      * f_c = 994.7 Hz, tau = 160 µs
      * AC analysis for the Bode plot; transient for the 1 V step response.

      V1 in 0 DC 0 AC 1 PULSE(0 1 0 160n 160n 3.2m 6.4m)
      R1 in out 16k
      C1 out 0 10n

      .ac dec 100 100m 1Meg
      .tran 800n 960u
      .end
      "
    `);
  });
});
