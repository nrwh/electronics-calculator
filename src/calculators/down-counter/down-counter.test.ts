import { describe, expect, it } from 'vitest';
import { evaluate } from '../../lib/logic';
import { runPipeline } from '../../lib/pipeline';
import { DEFAULT_SETTINGS } from '../../ui/settings';
import { bitWaveform, designDownCounter, flipFlopsFor, gateTree, pathTiming } from './design';
import def, { FAMILIES, equationText, familyTiming, type Out } from './index';

const base = { fclk: '10M', family: 'HC', vcc: '5', timing: 'table', tcq: '35n', tpd: '18n', tsu: '20n' };

describe('down counter design', () => {
  it('uses ⌈log2 N⌉ flip-flops', () => {
    expect([2, 3, 4, 5, 8, 9, 16].map(flipFlopsFor)).toEqual([1, 2, 2, 3, 3, 4, 4]);
  });

  for (let n = 2; n <= 16; n++) {
    it(`N = ${n}: counts down through every state and never locks out`, () => {
      const d = designDownCounter(n);
      // The logic reproduces the count sequence.
      let s = n - 1;
      for (let i = 0; i < 2 * n; i++) {
        const next = d.equations.reduce((acc, eq, bit) => acc | (evaluate(eq, s) << bit), 0);
        expect(next).toBe(s === 0 ? n - 1 : s - 1);
        s = next;
      }
      // Every unused state reaches the sequence.
      for (let u = n; u < 1 << d.k; u++) {
        let cur = u;
        let steps = 0;
        while (cur >= n && steps <= 1 << d.k) {
          cur = d.next[cur]!;
          steps++;
        }
        expect(cur).toBeLessThan(n);
      }
    });
  }

  it('gives the textbook equations for a mod-4 counter', () => {
    const d = designDownCounter(4);
    expect(equationText(d, 0)).toBe('D0 = Q̅0');
    // D1 = Q1 XNOR Q0 = Q̅1·Q̅0 + Q1·Q0
    expect(equationText(d, 1)).toBe('D1 = Q̅1·Q̅0 + Q1·Q0');
  });

  it('finds the output periods and duty cycles', () => {
    const d = designDownCounter(4);
    expect(bitWaveform(d, 0)).toMatchObject({ period: 2, duty: 0.5 });
    expect(bitWaveform(d, 1)).toMatchObject({ period: 4, duty: 0.5 });
    const d10 = designDownCounter(10);
    expect(bitWaveform(d10, 3)).toMatchObject({ period: 10, duty: 0.2 });
  });

  it('counts gate levels in 2-input trees', () => {
    // Q̅3·Q̅2·Q̅1·Q̅0 (4 literals: 2 AND levels) + Q3·Q0 → 1 OR level
    const g = gateTree([
      { mask: 15, value: 0 },
      { mask: 9, value: 9 },
    ]);
    expect(g).toEqual({ andLevels: 2, orLevels: 1, ands: 4, ors: 1 });
  });

  it('computes f_max = 1/(t_clk→Q + t_logic + t_su)', () => {
    const d = designDownCounter(4); // D0 = Q̅0 (no gates), D1 = two 2-literal terms: 1 AND + 1 OR
    const t = pathTiming(d, { tcq: 10e-9, tand: 5e-9, tor: 6e-9, tsu: 3e-9 });
    expect(t.levels).toBe(2);
    expect(t.fmax).toBeCloseTo(1 / 24e-9, 0);
  });
});

describe('down counter calculator', () => {
  it('solves f_out from N and N from f_out', () => {
    const r = runPipeline(def, 'fout', { ...base, N: '10' }, DEFAULT_SETTINGS);
    expect(r.values!.fout).toBe(1e6);
    const n = runPipeline(def, 'N', { ...base, fout: '1.3M' }, DEFAULT_SETTINGS);
    expect(n.values!.N).toBe(8);
    const cmp = n.compare.find((c) => c.key === 'fout')!;
    expect(cmp.achieved).toBe(1.25e6);
  });

  it('rejects N outside 2–16 and an out-of-range supply', () => {
    expect(runPipeline(def, 'N', { ...base, fout: '100k' }, DEFAULT_SETTINGS).fieldErrors.fout).toMatch(
      /N = 100/,
    );
    expect(
      runPipeline(def, 'fout', { ...base, N: '10', family: 'LVC', vcc: '5' }, DEFAULT_SETTINGS).fieldErrors
        .vcc,
    ).toBeDefined();
  });

  it('takes delays from the family table at or below V_CC', () => {
    expect(familyTiming(FAMILIES.HC, 5).point.vcc).toBe(4.5);
    expect(familyTiming(FAMILIES.LVC, 3.3).point.vcc).toBe(3.3);
    expect(familyTiming(FAMILIES.HC, 2).extrapolated).toBe(false);
  });

  it('warns when the clock is above f_max', () => {
    const r = runPipeline(def, 'fout', { ...base, fclk: '50M', N: '10' }, DEFAULT_SETTINGS);
    expect(r.ok).toBe(true);
    expect((r.out as Out).margin).toBeLessThan(1);
    expect(r.warnings.some((w) => w.field === 'fclk')).toBe(true);
  });

  it('builds an ngspice-only netlist', () => {
    const r = runPipeline(def, 'fout', { ...base, N: '10' }, DEFAULT_SETTINGS);
    const n = def.spice!(r.values as never, r.out as Out);
    expect('ngspiceOnly' in n && n.ngspiceOnly).toBe(true);
    const text = n.toString();
    expect(text).toMatch(/d_dff/);
    expect(text.match(/^Aff\d/gm)).toHaveLength(4);
  });
});
