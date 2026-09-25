// SPICE netlist builder and value formatting.
//
// SPICE is case-insensitive, so "1M" means 1 milli. Mega is always written "Meg".

const SPICE_PREFIXES: [number, string][] = [
  [1e12, 'T'],
  [1e9, 'G'],
  [1e6, 'Meg'],
  [1e3, 'k'],
  [1, ''],
  [1e-3, 'm'],
  [1e-6, 'u'],
  [1e-9, 'n'],
  [1e-12, 'p'],
  [1e-15, 'f'],
];

/** Format a number for a netlist, e.g. 1e6 → "1Meg", 4.7e-9 → "4.7n", 0.0015 → "1.5m". */
export function spiceValue(x: number, sig = 6): string {
  if (!Number.isFinite(x)) throw new Error(`Cannot write ${x} to a netlist`);
  if (x === 0) return '0';
  const ax = Math.abs(x);
  const rounded = Number(ax.toPrecision(sig));
  if (rounded >= 1e15 || rounded < 1e-15) return x.toExponential(sig - 1).replace(/\.?0+e/, 'e');
  let chosen = SPICE_PREFIXES[SPICE_PREFIXES.length - 1]!;
  for (const p of SPICE_PREFIXES) {
    if (rounded >= p[0] * (1 - 1e-12)) {
      chosen = p;
      break;
    }
  }
  const scaled = Number((rounded / chosen[0]).toPrecision(sig));
  return (x < 0 ? '-' : '') + String(scaled) + chosen[1];
}

export interface Unavailable {
  unavailable: true;
  reason: string;
}

export const unavailable = (reason: string): Unavailable => ({ unavailable: true, reason });

export function isUnavailable(x: unknown): x is Unavailable {
  return typeof x === 'object' && x !== null && (x as Unavailable).unavailable === true;
}

type Value = number | string;

const fmt = (v: Value): string => (typeof v === 'number' ? spiceValue(v) : v);

/**
 * Builds a netlist in sections so element order stays readable: title and notes, elements,
 * models and subcircuits, analyses.
 */
export class Netlist {
  private readonly header: string[] = [];
  private readonly elements: string[] = [];
  private readonly models: string[] = [];
  private readonly subckts: string[] = [];
  private readonly analyses: string[] = [];
  /** True when the netlist uses ngspice-only features (XSPICE). */
  ngspiceOnly = false;
  /** Suggested download file name without extension. */
  fileName: string;

  constructor(
    readonly title: string,
    fileName?: string,
  ) {
    this.fileName =
      fileName ??
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
  }

  comment(text: string): this {
    for (const line of text.split('\n')) this.header.push(`* ${line}`);
    return this;
  }

  /** Blank line or comment between groups of elements. */
  section(text?: string): this {
    this.elements.push(text ? `* ${text}` : '');
    return this;
  }

  /** Add an element: name, nodes, value and optional trailing parameters. */
  add(name: string, nodes: string[], value: Value, ...params: string[]): this {
    this.elements.push([name, ...nodes, fmt(value), ...params].join(' '));
    return this;
  }

  /** Add a raw element line. */
  raw(line: string): this {
    this.elements.push(line);
    return this;
  }

  model(name: string, type: string, params: Record<string, Value> = {}): this {
    const p = Object.entries(params)
      .map(([k, v]) => `${k}=${fmt(v)}`)
      .join(' ');
    this.models.push(`.model ${name} ${type}${p ? `(${p})` : ''}`);
    return this;
  }

  subckt(text: string): this {
    if (!this.subckts.includes(text)) this.subckts.push(text);
    return this;
  }

  analysis(line: string): this {
    this.analyses.push(line);
    return this;
  }

  /** The netlist text, optionally with extra lines (e.g. a .control block) before `.end`. */
  toString(extra: string[] = []): string {
    const lines = [`* ${this.title}`, ...this.header, '', ...this.elements];
    if (this.models.length || this.subckts.length) lines.push('', ...this.models);
    for (const s of this.subckts) lines.push('', s);
    lines.push('', ...this.analyses, ...extra, '.end', '');
    return lines.join('\n');
  }
}

/** Common helper: a PULSE source definition. */
export function pulse(
  v1: number,
  v2: number,
  delay: number,
  rise: number,
  fall: number,
  width: number,
  period: number,
): string {
  return `PULSE(${[v1, v2, delay, rise, fall, width, period].map((x) => spiceValue(x)).join(' ')})`;
}

/** A SIN source definition. */
export function sine(offset: number, amplitude: number, freq: number): string {
  return `SIN(${[offset, amplitude, freq].map((x) => spiceValue(x)).join(' ')})`;
}
