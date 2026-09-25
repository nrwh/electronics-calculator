// Calculators are discovered by glob: adding a folder is enough, there is no central list.

import type { AnyCalculatorDef, CalculatorMeta } from './types';

const metaModules = import.meta.glob<{ default: CalculatorMeta }>(['./*/meta.ts', '!./_template/**'], {
  eager: true,
});
const defModules = import.meta.glob<{ default: AnyCalculatorDef }>(['./*/index.ts', '!./_template/**']);

const idFromPath = (p: string): string => p.split('/')[1]!;

export const metas: CalculatorMeta[] = Object.values(metaModules).map((m) => m.default);

export function getMeta(id: string): CalculatorMeta | undefined {
  return metas.find((m) => m.id === id);
}

/** Load a calculator's definition (a separate chunk per calculator). */
export async function loadCalculator(id: string): Promise<AnyCalculatorDef> {
  const entry = Object.entries(defModules).find(([p]) => idFromPath(p) === id);
  if (!entry) throw new Error(`Unknown calculator "${id}"`);
  return (await entry[1]()).default;
}
