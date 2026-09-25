// Checks every calculator against the shared contract, so a new calculator gets these for free.

import { describe, expect, it } from 'vitest';
import { findOption, inputKeys, parseVar, runPipeline } from '../lib/pipeline';
import { isUnavailable } from '../lib/spice';
import { RESERVED_KEYS } from '../lib/url';
import { renderPlot } from '../plot/render';
import { prerender } from '../ui/prerender';
import { DEFAULT_SETTINGS } from '../ui/settings';
import type { AnyCalculatorDef, CalculatorMeta, Settings } from './types';
import { CATEGORY_LABELS } from './types';

const metaModules = import.meta.glob<{ default: CalculatorMeta }>(['./*/meta.ts', '!./_template/**'], {
  eager: true,
});
const defModules = import.meta.glob<{ default: AnyCalculatorDef }>(['./*/index.ts', '!./_template/**'], {
  eager: true,
});

const exact: Settings = { ...structuredClone(DEFAULT_SETTINGS), series: { R: 'none', C: 'none', L: 'none' } };

function defaults(def: AnyCalculatorDef): Record<string, string> {
  return Object.fromEntries(Object.entries(def.vars).map(([k, d]) => [k, d.default]));
}

const NUM_JUNK = /NaN|Infinity|undefined/;

for (const [path, mod] of Object.entries(defModules)) {
  const id = path.split('/')[1]!;
  const def = mod.default;
  const meta = metaModules[`./${id}/meta.ts`]?.default;

  describe(`calculator ${id}`, () => {
    it('has metadata matching its folder', () => {
      expect(meta).toBeDefined();
      expect(meta!.id).toBe(id);
      expect(CATEGORY_LABELS[meta!.category]).toBeDefined();
      expect(meta!.summary.length).toBeGreaterThan(20);
      expect(meta!.keywords.length).toBeGreaterThan(2);
    });

    it('uses no reserved query keys and valid defaults', () => {
      for (const [key, d] of Object.entries(def.vars)) {
        expect(RESERVED_KEYS).not.toContain(key);
        expect(parseVar(d, d.default), `${key} default`).not.toHaveProperty('error');
      }
    });

    it('has a solver for every option, and targets that exist', () => {
      expect(def.solveFor.length).toBeGreaterThan(0);
      for (const o of def.solveFor) {
        expect(def.solve[o.id], o.id).toBeTypeOf('function');
        for (const t of o.targets) expect(def.vars[t], `${o.id} target ${t}`).toBeDefined();
        for (const t of o.targets) expect(def.vars[t]!.kind).not.toBe('choice');
      }
    });

    for (const o of def.solveFor) {
      it(`solves "${o.id}" with the defaults and renders everything`, () => {
        const r = runPipeline(def, o.id, defaults(def), DEFAULT_SETTINGS);
        expect(r.errors, r.errors.join('; ')).toEqual([]);
        expect(r.fieldErrors).toEqual({});
        expect(r.ok).toBe(true);
        const v = r.values!;
        const rows = def.results(v, r.out, DEFAULT_SETTINGS);
        expect(rows.some((row) => row.headline)).toBe(true);
        for (const row of rows)
          if (typeof row.value === 'number') expect(Number.isFinite(row.value), row.label).toBe(true);
        const sch = def.schematic(v, r.out);
        expect(sch.svg).toMatch(/^<svg/);
        expect(sch.svg).not.toMatch(NUM_JUNK);
        for (const [i, p] of (def.plots?.(v, r.out) ?? []).entries()) {
          const svg = renderPlot(p, `p${i}`);
          expect(svg, p.title).not.toMatch(NUM_JUNK);
        }
        expect(def.guide(v, r.out, DEFAULT_SETTINGS).length).toBeGreaterThan(0);
        const n = def.spice?.(v, r.out);
        if (n && !isUnavailable(n)) {
          const text = n.toString();
          expect(text).not.toMatch(NUM_JUNK);
          expect(text).toMatch(/\.end\n$/);
          // Mega must be written "Meg": a bare "M" suffix on a number means milli in SPICE.
          // (Lowercase "m" is how spiceValue writes milli, so only uppercase is suspicious.)
          expect(text).not.toMatch(/\dM(?![a-zA-Z])/);
        }
      });
    }

    it('pre-renders the default design for its page', () => {
      const top = prerender(def);
      const shown = Object.values(def.vars).length;
      expect(top.fields.match(/class="field[ "]/g)).toHaveLength(shown);
      expect(top.solve).toContain('name="solve"');
      expect(top.headline).toContain('hl-item');
      expect(top.schematic).toMatch(/^<svg/);
      expect(top.fields + top.headline).not.toMatch(NUM_JUNK);
    });

    it('round-trips: feeding a solved (unsnapped) value back reproduces the original inputs', () => {
      const raw = defaults(def);
      for (const a of def.solveFor) {
        const ra = runPipeline(def, a.id, raw, exact);
        expect(ra.ok, `${a.id}: ${ra.errors.join('; ')}`).toBe(true);
        for (const b of def.solveFor) {
          if (a === b) continue;
          const aInputs = inputKeys(def, findOption(def, a.id));
          // b must solve for things a took as inputs, using a's solved values as inputs.
          if (!b.targets.every((t) => aInputs.includes(t))) continue;
          const rawB = { ...raw };
          for (const [k, s] of Object.entries(ra.solved)) rawB[k] = String(s.ideal);
          const rb = runPipeline(def, b.id, rawB, exact);
          expect(rb.ok, `${a.id} → ${b.id}: ${rb.errors.join('; ')}`).toBe(true);
          for (const t of b.targets) {
            const original = ra.values![t] as number;
            const back = rb.solved[t]!.ideal;
            expect(Math.abs(back / original - 1), `${a.id} → ${b.id}: ${t}`).toBeLessThan(1e-9);
          }
        }
      }
    });
  });
}
