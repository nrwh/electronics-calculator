// Calculator page state in the query string:
// ?solve=R&fc=1k&C=10n&eR=E24&eC=E12&tR=1&tC=5&tab=graphs&v=1

import type { AnyCalculatorDef, PartType, Settings } from '../calculators/types';
import { isSeries, isTolerance } from '../ui/settings';
import { findOption, inputKeys } from './pipeline';

export const TABS = ['graphs', 'results', 'components', 'derivation', 'spice'] as const;
export type TabId = (typeof TABS)[number];

/** Query keys the page uses itself; calculator variables must not use these names. */
export const RESERVED_KEYS = ['solve', 'tab', 'v', 'eR', 'eC', 'eL', 'tR', 'tC', 'tL', 'q', 'cat'];

export interface CalcState {
  solve: string;
  /** Raw text for every variable (targets keep their last input text, which isn't written to the URL). */
  raw: Record<string, string>;
  settings: Settings;
  tab: TabId | null;
}

/** Part types used by a calculator, in R, C, L order. */
export function partTypes(def: AnyCalculatorDef): PartType[] {
  const used = new Set<PartType>();
  for (const d of Object.values(def.vars)) if (d.kind === 'part') used.add(d.part);
  for (const t of def.extraSeries ?? []) used.add(t);
  return (['R', 'C', 'L'] as PartType[]).filter((t) => used.has(t));
}

export function readState(def: AnyCalculatorDef, search: string, prefs: Settings): CalcState {
  let q = new URLSearchParams(search);
  const v = Number(q.get('v'));
  if (q.has('v') && Number.isInteger(v) && v < def.urlVersion && def.migrate) q = def.migrate(q, v);
  const raw: Record<string, string> = {};
  for (const [key, d] of Object.entries(def.vars)) raw[key] = q.get(key) ?? d.default;
  const settings: Settings = structuredClone(prefs);
  for (const t of ['R', 'C', 'L'] as PartType[]) {
    const e = q.get(`e${t}`);
    if (isSeries(e)) settings.series[t] = e;
    const tol = Number(q.get(`t${t}`));
    if (q.has(`t${t}`) && isTolerance(tol)) settings.tol[t] = tol;
  }
  const tab = q.get('tab');
  return {
    solve: findOption(def, q.get('solve')).id,
    raw,
    settings,
    tab: (TABS as readonly string[]).includes(tab ?? '') ? (tab as TabId) : null,
  };
}

/** The query string for a state. Solved values are not stored; they are recomputed. */
export function writeState(def: AnyCalculatorDef, state: CalcState): string {
  const q = new URLSearchParams();
  const option = findOption(def, state.solve);
  q.set('solve', option.id);
  for (const key of inputKeys(def, option)) q.set(key, state.raw[key] ?? def.vars[key]!.default);
  for (const t of partTypes(def)) {
    q.set(`e${t}`, state.settings.series[t]);
    q.set(`t${t}`, String(state.settings.tol[t]));
  }
  if (state.tab) q.set('tab', state.tab);
  q.set('v', String(def.urlVersion));
  // URLSearchParams encodes µ and Ω; keep the query readable where it is safe to.
  return '?' + q.toString().replace(/%C2%B5/g, 'u');
}
