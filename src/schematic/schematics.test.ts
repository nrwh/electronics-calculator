// Every calculator's schematic, in every variant, renders from its KiCad file with all ${NAME}
// variables filled in. The snapshots make a schematic change visible in review: after editing a
// .kicad_sch file, check the diff and accept it with `npx vitest -u`.

import { describe, expect, it } from 'vitest';
import type { AnyCalculatorDef } from '../calculators/types';
import { runPipeline } from '../lib/pipeline';
import { DEFAULT_SETTINGS } from '../ui/settings';

const defs = import.meta.glob<{ default: AnyCalculatorDef }>('../calculators/*/index.ts', { eager: true });

/** Default inputs, then each value of each choice; the down counter at every flip-flop count. */
function variants(id: string, def: AnyCalculatorDef): Record<string, string>[] {
  const out: Record<string, string>[] = [{}];
  for (const [key, d] of Object.entries(def.vars))
    if (d.kind === 'choice')
      for (const o of d.options) if (o.value !== d.default) out.push({ [key]: o.value });
  if (id === 'down-counter') for (const N of ['2', '4', '8', '16']) out.push({ N });
  return out;
}

for (const [file, mod] of Object.entries(defs)) {
  const id = file.split('/')[2]!;
  const def = mod.default;
  describe(`${id} schematic`, () => {
    for (const change of variants(id, def)) {
      it(JSON.stringify(change), () => {
        const raw = Object.fromEntries(Object.entries(def.vars).map(([k, d]) => [k, change[k] ?? d.default]));
        const r = runPipeline(def, def.solveFor[0]!.id, raw, DEFAULT_SETTINGS);
        // Some choices make the default inputs an invalid design; the page draws no schematic then.
        if (!r.ok) return;
        const { svg } = def.schematic(r.values, r.out);
        expect(svg).not.toMatch(/\$\{/);
        expect(svg).toMatchSnapshot();
      });
    }
  });
}
