// The shared pipeline every calculator runs through: parse → solve → snap → analyse → compare → spread.

import type {
  AnyCalculatorDef,
  Message,
  PartType,
  Settings,
  Snapped,
  AnySolveOption,
  VarDef,
} from '../calculators/types';
import { PART_UNITS } from '../calculators/types';
import { inSeries, nearest } from './eseries';
import { corners } from './tolerance';
import { formatSI, parseSI } from './units';

export type RawInputs = Record<string, string>;
type Values = Record<string, number | string>;

export interface SolvedValue extends Snapped {
  /** True when the value was snapped to a series (a part with a series selected). */
  snapped: boolean;
}

export interface Comparison {
  key: string;
  target: number;
  achieved: number;
  /** achieved / target − 1 */
  err: number;
}

export interface Spread {
  min: number;
  max: number;
}

export interface PipelineResult {
  ok: boolean;
  option: AnySolveOption;
  /** Errors tied to a field, shown under that field. */
  fieldErrors: Record<string, string>;
  /** Errors for the whole design. */
  errors: string[];
  warnings: Message[];
  /** Every variable's value as used by analyse (solved parts snapped). */
  values?: Values;
  solved: Record<string, SolvedValue>;
  compare: Comparison[];
  achieved: Record<string, number>;
  spread: Record<string, Spread>;
  /** Parts the user typed that are not in the selected series. */
  offSeries: string[];
  out?: unknown;
}

/** Maximum number of parts varied in the tolerance spread (2^6 = 64 runs). */
export const MAX_SPREAD_PARTS = 6;

export function unitOf(d: VarDef): string {
  if (d.kind === 'part') return PART_UNITS[d.part];
  if (d.kind === 'qty') return d.unit;
  if (d.kind === 'int') return d.unit ?? '';
  return '';
}

/** Parse one variable's raw text. Returns the value or an error message. */
export function parseVar(d: VarDef, raw: string | undefined): { value: number | string } | { error: string } {
  const text = (raw ?? d.default).trim();
  if (d.kind === 'choice') {
    return d.options.some((o) => o.value === text) ? { value: text } : { error: 'Choose one of the options' };
  }
  if (text === '') return { error: 'Enter a value' };
  const unit = unitOf(d);
  if (d.kind === 'int') {
    const n = Number(text);
    if (!Number.isInteger(n)) return { error: 'Enter a whole number' };
    if (n < d.min || n > d.max) return { error: `Must be ${d.min} to ${d.max}` };
    return { value: n };
  }
  const v = parseSI(text, unit);
  if (v === null) return { error: 'Enter a number, e.g. 4k7, 100n, 2.2u' };
  const positive = d.kind === 'part' || d.positive !== false;
  if (positive && !(v > 0)) return { error: 'Must be greater than zero' };
  if (d.min !== undefined && v < d.min) return { error: `Must be at least ${formatSI(d.min, unit)}` };
  if (d.max !== undefined && v > d.max) return { error: `Must be at most ${formatSI(d.max, unit)}` };
  return { value: v };
}

export function findOption(def: AnyCalculatorDef, id: string | null | undefined): AnySolveOption {
  return def.solveFor.find((o) => o.id === id) ?? def.solveFor[0]!;
}

/** Variables that are inputs for an option: everything except its targets and unused variables. */
export function inputKeys(def: AnyCalculatorDef, option: AnySolveOption): string[] {
  return Object.keys(def.vars).filter(
    (k) => !option.targets.includes(k) && !(option.unused ?? []).includes(k),
  );
}

function tolFraction(def: AnyCalculatorDef, key: string, s: Settings): number {
  const d = def.vars[key]!;
  return d.kind === 'part' ? s.tol[d.part as PartType] / 100 : 0;
}

export function runPipeline(
  def: AnyCalculatorDef,
  optionId: string,
  raw: RawInputs,
  settings: Settings,
): PipelineResult {
  const option = findOption(def, optionId);
  const result: PipelineResult = {
    ok: false,
    option,
    fieldErrors: {},
    errors: [],
    warnings: [],
    solved: {},
    compare: [],
    achieved: {},
    spread: {},
    offSeries: [],
  };

  // 1. Parse the inputs.
  const known: Values = {};
  for (const key of inputKeys(def, option)) {
    const p = parseVar(def.vars[key]!, raw[key]);
    if ('error' in p) result.fieldErrors[key] = p.error;
    else known[key] = p.value;
  }
  for (const key of [...option.targets, ...(option.unused ?? [])]) known[key] = NaN;
  if (Object.keys(result.fieldErrors).length) return result;

  const absorb = (errors: Message[]): void => {
    for (const e of errors) {
      if (e.field && e.field in def.vars && !result.fieldErrors[e.field])
        result.fieldErrors[e.field] = e.message;
      else result.errors.push(e.message);
    }
  };

  // 2. Solve for the targets.
  const solver = def.solve[option.id];
  if (!solver) {
    result.errors.push(`No solver for option "${option.id}"`);
    return result;
  }
  const solved = solver(known as never, settings);
  if (!solved.ok) {
    absorb(solved.errors);
    return result;
  }
  result.warnings.push(...solved.warnings);

  // 3. Snap solved parts to the series for their type.
  const values: Values = { ...known };
  for (const key of option.targets) {
    const ideal = (solved.value as Values)[key];
    if (typeof ideal !== 'number' || !Number.isFinite(ideal)) {
      result.errors.push(`Could not solve for ${def.vars[key]?.label ?? key}`);
      return result;
    }
    const d = def.vars[key]!;
    let value = ideal;
    let snapped = false;
    if (d.kind === 'part') {
      const series = settings.series[d.part];
      if (series !== 'none') {
        value = nearest(ideal, series);
        snapped = true;
      }
    }
    values[key] = value;
    result.solved[key] = { ideal, value, err: value / ideal - 1, snapped };
  }

  // Parts typed by the user are used as entered; note those outside the selected series.
  for (const key of inputKeys(def, option)) {
    const d = def.vars[key]!;
    if (d.kind === 'part' && !inSeries(values[key] as number, settings.series[d.part], 1e-4))
      result.offSeries.push(key);
  }

  // 4. Analyse with every variable known.
  const analysed = def.analyse(values as never, settings);
  if (!analysed.ok) {
    absorb(analysed.errors);
    return result;
  }
  result.warnings.push(...analysed.warnings);
  result.values = values;
  result.out = analysed.value.out;
  const achieved = analysed.value.achieved as Record<string, number>;
  result.achieved = { ...achieved };

  // 5. Compare the achieved value of each input variable with its target.
  for (const [key, a] of Object.entries(achieved)) {
    const target = known[key];
    if (typeof target === 'number' && Number.isFinite(target) && !option.targets.includes(key)) {
      result.compare.push({ key, target, achieved: a, err: a / target - 1 });
    }
  }

  // 6. Spread: re-run analyse at every ± tolerance corner of the parts.
  const partKeys = Object.keys(def.vars)
    .filter(
      (k) => def.vars[k]!.kind === 'part' && typeof values[k] === 'number' && Number.isFinite(values[k]),
    )
    .filter((k) => tolFraction(def, k, settings) > 0)
    .slice(0, MAX_SPREAD_PARTS);
  if (partKeys.length) {
    const spread: Record<string, Spread> = {};
    for (const [k, a] of Object.entries(achieved)) spread[k] = { min: a, max: a };
    for (const factors of corners(partKeys.map((k) => tolFraction(def, k, settings)))) {
      const v: Values = { ...values };
      partKeys.forEach((k, i) => (v[k] = (values[k] as number) * factors[i]!));
      const r = def.analyse(v as never, settings);
      if (!r.ok) continue;
      for (const [k, a] of Object.entries(r.value.achieved as Record<string, number>)) {
        const s = spread[k];
        if (s && Number.isFinite(a)) {
          s.min = Math.min(s.min, a);
          s.max = Math.max(s.max, a);
        }
      }
    }
    result.spread = spread;
  }

  result.ok = true;
  return result;
}
