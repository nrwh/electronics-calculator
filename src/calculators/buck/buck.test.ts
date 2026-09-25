import { describe, expect, it } from 'vitest';
import { runPipeline } from '../../lib/pipeline';
import { DEFAULT_SETTINGS } from '../../ui/settings';
import type { Settings } from '../types';
import def, { capacitanceFor, duty, inductorRipple, outputRipple, type Out } from './index';

const exact: Settings = { ...structuredClone(DEFAULT_SETTINGS), series: { R: 'none', C: 'none', L: 'none' } };
const base = {
  topology: 'async',
  vinMin: '10',
  vinMax: '14',
  vout: '5',
  iout: '2',
  fsw: '500k',
  eta: '90',
  vf: '0.5',
  vref: '0.8',
  esr: '0',
  rippleI: '30',
  rippleV: '20m',
};

describe('Buck converter', () => {
  it('computes the duty cycle (hand-calculated)', () => {
    // Async: (5 + 0.5)/(14 + 0.5) = 0.37931; sync: 5/(0.9·10) = 0.5556
    expect(duty('async', 14, 5, 0.5, 0.9)).toBeCloseTo(0.37931, 5);
    expect(duty('sync', 10, 5, 0, 0.9)).toBeCloseTo(0.55556, 5);
  });

  it('sizes L for the ripple target at V_in,max (hand-calculated)', () => {
    const r = runPipeline(def, 'LC', base, exact);
    expect(r.ok).toBe(true);
    // ΔI = 0.3·2 = 0.6 A; L = (5.5)(1 − 0.37931)/(500k·0.6) = 11.379 µH
    expect(r.solved.L!.ideal).toBeCloseTo(11.379e-6, 9);
    // With ESR = 0 the ripple is the capacitive term ΔI/(8·f·C): C = 0.6/(8·500k·20m) = 7.5 µF
    expect(r.solved.Cout!.ideal / 7.5e-6).toBeCloseTo(1, 3);
  });

  it('matches ΔI/(8fC) with no ESR and ΔI·ESR when ESR dominates', () => {
    expect(outputRipple(1, 0.4, 1e6, 10e-6, 0) / (1 / (8 * 1e6 * 10e-6))).toBeCloseTo(1, 3);
    expect(outputRipple(1, 0.4, 1e6, 1, 0.05) / 0.05).toBeCloseTo(1, 3);
    // Mixed: less than the sum of the two terms, more than either alone.
    const mixed = outputRipple(1, 0.4, 1e6, 10e-6, 0.0125);
    expect(mixed).toBeLessThan(0.0125 + 0.0125);
    expect(mixed).toBeGreaterThan(0.0125);
  });

  it('inverts the ripple model when solving for C', () => {
    const C = capacitanceFor(0.015, 0.8, 0.3, 400e3, 0.005);
    expect(outputRipple(0.8, 0.3, 400e3, C, 0.005)).toBeCloseTo(0.015, 9);
    expect(capacitanceFor(0.003, 0.8, 0.3, 400e3, 0.005)).toBeNaN();
  });

  it('solves the ripple from L and C', () => {
    const r = runPipeline(def, 'ripple', { ...base, L: '10u', Cout: '22u' }, exact);
    const dI = inductorRipple(5.5, 0.37931034, 500e3, 10e-6);
    expect(r.values!.rippleI as number).toBeCloseTo((100 * dI) / 2, 4);
  });

  it('computes currents, the input capacitor and the divider', () => {
    const r = runPipeline(def, 'ripple', { ...base, L: '10u', Cout: '22u' }, DEFAULT_SETTINGS);
    const o = r.out as Out;
    expect(o.ipk).toBeCloseTo(2 + o.dI / 2, 12);
    expect(o.irms).toBeCloseTo(Math.sqrt(4 + o.dI ** 2 / 12), 12);
    // D spans 0.379–0.5 at 10 V (async: 5.5/10.5 = 0.524), so the input RMS current is I_out/2.
    expect(o.icinRms).toBeCloseTo(1, 9);
    // Divider for 5 V from 0.8 V: ratio 5.25, E24 pair close to it.
    expect(Math.abs(o.voutSet / 5 - 1)).toBeLessThan(0.01);
  });

  it('rejects impossible inputs', () => {
    expect(runPipeline(def, 'LC', { ...base, vout: '12' }, exact).fieldErrors.vout).toBeDefined();
    expect(runPipeline(def, 'LC', { ...base, vinMax: '8' }, exact).fieldErrors.vinMax).toBeDefined();
    expect(runPipeline(def, 'LC', { ...base, vref: '6' }, exact).fieldErrors.vref).toBeDefined();
    expect(runPipeline(def, 'LC', { ...base, esr: '1', rippleV: '10m' }, exact).fieldErrors.rippleV).toMatch(
      /ESR/,
    );
  });

  it('warns about high duty cycle and discontinuous conduction', () => {
    const hi = runPipeline(def, 'LC', { ...base, vinMin: '5.3', vout: '5' }, exact);
    expect(hi.warnings.some((w) => w.field === 'vinMin')).toBe(true);
    const dcm = runPipeline(def, 'ripple', { ...base, L: '1u', Cout: '22u' }, exact);
    expect(dcm.warnings.some((w) => w.field === 'iout')).toBe(true);
  });
});
