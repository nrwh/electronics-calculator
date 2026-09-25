// The contract every calculator implements. See CONTRIBUTING.md.

import type { SeriesChoice } from '../lib/eseries';
import type { Netlist, Unavailable } from '../lib/spice';
import type { SchematicDoc } from '../schematic/draw';
import type { PlotSpec } from '../plot/types';

export type PartType = 'R' | 'C' | 'L';

export const PART_UNITS: Record<PartType, string> = { R: 'Ω', C: 'F', L: 'H' };

export type Category = 'filters' | 'power' | 'opamp' | 'oscillators' | 'digital';

export const CATEGORY_LABELS: Record<Category, string> = {
  filters: 'Filters',
  power: 'Power',
  opamp: 'Op-amp circuits',
  oscillators: 'Oscillators',
  digital: 'Digital',
};

/** Eagerly loaded metadata: feeds the home page, the page <title> and the filter. */
export interface CalculatorMeta {
  id: string;
  title: string;
  category: Category;
  /** One sentence for cards and the meta description. */
  summary: string;
  /** Extra search terms, including common misspellings. */
  keywords: string[];
}

interface VarBase {
  label: string;
  /** Short symbol shown next to the label and in the strip, e.g. "f_c" → rendered f<sub>c</sub>. */
  symbol?: string;
  help?: string;
  /** Show the field only when a choice variable has one of these values. Hidden fields keep their value. */
  showIf?: { key: string; values: string[] };
}

/** A numeric quantity with a unit. */
export interface QtyVar extends VarBase {
  kind: 'qty';
  unit: string;
  /** Default input text, e.g. "1k". */
  default: string;
  /** Inclusive bounds checked when parsing. */
  min?: number;
  max?: number;
  /** When true, the value must be strictly greater than zero (the default for most quantities). */
  positive?: boolean;
}

/** A component value. Snapped to the series for its type when solved for. */
export interface PartVar extends VarBase {
  kind: 'part';
  part: PartType;
  default: string;
  min?: number;
  max?: number;
}

/** A whole number. */
export interface IntVar extends VarBase {
  kind: 'int';
  default: string;
  min: number;
  max: number;
  unit?: string;
}

/** One of a fixed set of options. Always an input. */
export interface ChoiceVar<T extends string = string> extends VarBase {
  kind: 'choice';
  options: readonly { value: T; label: string }[];
  default: T;
}

export type VarDef = QtyVar | PartVar | IntVar | ChoiceVar;
export type VarSchema = Record<string, VarDef>;

export type ValueOf<D> = D extends ChoiceVar<infer T> ? T : number;
export type ValuesOf<S extends VarSchema> = { -readonly [K in keyof S]: ValueOf<S[K]> };

export const qty = (d: Omit<QtyVar, 'kind'>): QtyVar => ({ kind: 'qty', positive: true, ...d });
export const part = (p: PartType, d: Omit<PartVar, 'kind' | 'part'>): PartVar => ({
  kind: 'part',
  part: p,
  ...d,
});
export const int = (d: Omit<IntVar, 'kind'>): IntVar => ({ kind: 'int', ...d });
export const choice = <const T extends string>(d: Omit<ChoiceVar<T>, 'kind'>): ChoiceVar<T> => ({
  kind: 'choice',
  ...d,
});

export interface SolveOption<S extends VarSchema> {
  id: string;
  label: string;
  /** Variables computed by this option; every other variable (except `derived`) is an input. */
  targets: (keyof S & string)[];
  /** Variables this option ignores entirely (neither input nor target). */
  unused?: (keyof S & string)[];
}

export interface Message<K extends string = string> {
  /** The variable the message belongs to, or null for the whole design. */
  field: K | null;
  message: string;
}
export type Warning<K extends string = string> = Message<K>;
export type FieldError<K extends string = string> = Message<K>;

export type Outcome<T, K extends string = string> =
  { ok: true; value: T; warnings: Warning<K>[] } | { ok: false; errors: FieldError<K>[] };

export function ok<T, K extends string = string>(value: T, warnings: Warning<K>[] = []): Outcome<T, K> {
  return { ok: true, value, warnings };
}

export function fail<K extends string = string>(field: K | null, message: string): Outcome<never, K> {
  return { ok: false, errors: [{ field, message }] };
}

export function fails<K extends string = string>(errors: FieldError<K>[]): Outcome<never, K> {
  return { ok: false, errors };
}

export interface Snapped {
  ideal: number;
  value: number;
  /** value / ideal − 1 */
  err: number;
}

export interface Settings {
  series: Record<PartType, SeriesChoice>;
  /** Tolerance in percent for each part type. */
  tol: Record<PartType, number>;
}

export interface ResultRow<K extends string = string> {
  label: string;
  symbol?: string;
  value: number | string;
  unit?: string;
  /** Shown in the top panel as well as in the Results tab. */
  headline?: boolean;
  /** Links the row to an `achieved` variable so the UI can show the target, error and spread. */
  achieved?: K;
  /** Significant digits (default 4). */
  sig?: number;
  /** Muted text after the value. */
  note?: string;
  /** Rows with the same group are shown under one heading in the Results tab. */
  group?: string;
  status?: 'ok' | 'warn' | 'fail';
}

export interface GuideItem {
  status: 'ok' | 'warn' | 'fail' | 'info';
  title: string;
  text: string;
}

export interface AnalyseResult<S extends VarSchema, O> {
  out: O;
  /** Values the design actually achieves for input variables (compared with the target). */
  achieved: Partial<ValuesOf<S>>;
}

type Keys<S> = keyof S & string;

export interface CalculatorDef<S extends VarSchema = VarSchema, O = unknown> {
  vars: S;
  /** The first option is the default. */
  solveFor: SolveOption<S>[];
  /** Bump when variables change; `migrate` upgrades old links. */
  urlVersion: number;
  migrate?(q: URLSearchParams, from: number): URLSearchParams;
  /** Part types whose series the calculator uses for derived parts (e.g. a feedback divider). */
  extraSeries?: PartType[];
  /**
   * Stage 1: compute ideal values for the targets of each solve option. `known` holds every
   * input; target fields are NaN.
   */
  solve: Record<string, (known: ValuesOf<S>, s: Settings) => Outcome<Partial<ValuesOf<S>>, Keys<S>>>;
  /** Stage 2: every variable is known (solved parts snapped). Never throws for bad input. */
  analyse(v: ValuesOf<S>, s: Settings): Outcome<AnalyseResult<S, O>, Keys<S>>;
  results(v: ValuesOf<S>, o: O, s: Settings): ResultRow<Keys<S>>[];
  schematic(v: ValuesOf<S>, o: O): SchematicDoc;
  plots?(v: ValuesOf<S>, o: O): PlotSpec[];
  guide(v: ValuesOf<S>, o: O, s: Settings): GuideItem[];
  spice?(v: ValuesOf<S>, o: O): Netlist | Unavailable;
}

/** Identity helper that checks a definition and keeps its precise types. */
export function defineCalculator<S extends VarSchema, O>(def: CalculatorDef<S, O>): CalculatorDef<S, O> {
  return def;
}

/**
 * A SPICE check run in CI (scripts/spice-check.ts): the design is computed by the same pipeline
 * as the page, simulated with ngspice, and each measured value must match the calculator.
 */
export interface SpiceCase {
  name: string;
  solve: string;
  /** Inputs that differ from the defaults. */
  raw?: Record<string, string>;
  settings?: Partial<Settings>;
  /**
   * ngspice commands run after `run`, e.g. ['setplot ac1', 'meas ac fc when vdb(out)=-3.0103'].
   * A function receives the design, for measurements at frequencies that depend on it.
   */
  control: string[] | ((r: SpiceDesign) => string[]);
  checks: SpiceExpectation[];
}

export interface SpiceDesign {
  values: Record<string, number | string>;
  out: unknown;
  achieved: Record<string, number>;
}

export interface SpiceExpectation {
  /** Name of a `meas` result. */
  meas: string;
  label: string;
  /** The calculator's value to compare with. `r` is the pipeline result for the case. */
  expected: (r: {
    values: Record<string, number | string>;
    out: unknown;
    achieved: Record<string, number>;
  }) => number;
  /** Allowed relative error (default 1 %). */
  relTol?: number;
  /** Allowed absolute error; used instead of relTol when given. */
  absTol?: number;
}

/** A solve option without its variable-name type. */
export interface AnySolveOption {
  id: string;
  label: string;
  targets: string[];
  unused?: string[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Type-erased definition used by the page and the pipeline. It is structural (not
 * CalculatorDef<VarSchema, any>) because `keyof S` makes CalculatorDef contravariant in S, so a
 * concrete calculator would not be assignable to the generic instantiation.
 */
export interface AnyCalculatorDef {
  vars: VarSchema;
  solveFor: AnySolveOption[];
  urlVersion: number;
  migrate?(q: URLSearchParams, from: number): URLSearchParams;
  extraSeries?: PartType[];
  solve: Record<string, (known: any, s: Settings) => Outcome<Record<string, any>>>;
  analyse(v: any, s: Settings): Outcome<{ out: any; achieved: Record<string, any> }>;
  results(v: any, o: any, s: Settings): ResultRow[];
  schematic(v: any, o: any): SchematicDoc;
  plots?(v: any, o: any): PlotSpec[];
  guide(v: any, o: any, s: Settings): GuideItem[];
  spice?(v: any, o: any): Netlist | Unavailable;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
