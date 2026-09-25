// Parse and format SI values: "4k7", "100n", "2.2µ", "1M" (mega), "1m" (milli), "1meg".

const PREFIXES: Record<string, number> = {
  f: 1e-15,
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  µ: 1e-6, // U+00B5 micro sign
  μ: 1e-6, // U+03BC Greek mu
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
};

/** Unit spellings accepted as a suffix, keyed by the canonical unit. Compared case-insensitively. */
const UNIT_ALIASES: Record<string, string[]> = {
  Ω: ['Ω', 'ω', 'ohm', 'ohms'],
  Hz: ['Hz'],
  F: ['F'],
  H: ['H'],
  V: ['V'],
  A: ['A'],
  s: ['s', 'sec'],
  W: ['W'],
  '%': ['%'],
  '°': ['°', 'deg'],
};

const NUMBER = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(.*)$/;

function stripUnit(rest: string, unit: string | undefined): string | null {
  if (!unit) return null;
  const aliases = UNIT_ALIASES[unit] ?? [unit];
  const lower = rest.toLowerCase();
  for (const a of aliases) {
    if (a && lower.endsWith(a.toLowerCase())) return rest.slice(0, rest.length - a.length);
  }
  return null;
}

/**
 * Interpret what follows the number: '', a prefix, a prefix followed by digits ("k7" in "4k7"),
 * or "meg". For resistances, "R" is accepted as the decimal marker ("4R7").
 */
function applyPrefix(numText: string, rest: string, unit: string | undefined): number | null {
  const base = Number(numText);
  if (rest === '') return base;
  const simpleNumber = /^[+-]?\d+$/.test(numText);
  const megMatch = /^meg(\d*)$/i.exec(rest);
  if (megMatch) {
    const digits = megMatch[1] ?? '';
    if (digits && !simpleNumber) return null;
    return Number(numText + (digits ? '.' + digits : '')) * 1e6;
  }
  let mult: number | undefined = PREFIXES[rest[0]!];
  if (mult === undefined && unit === 'Ω' && (rest[0] === 'R' || rest[0] === 'r')) mult = 1;
  if (mult === undefined) return null;
  const digits = rest.slice(1);
  if (digits === '') return base * mult;
  if (!/^\d+$/.test(digits) || !simpleNumber) return null;
  return Number(`${numText}.${digits}`) * mult;
}

/**
 * Parse a value typed by the user. Returns null when the text is not a number.
 * `unit` is the field's unit; a trailing copy of it ("10kHz", "4.7nF") is ignored.
 */
export function parseSI(text: string, unit?: string): number | null {
  const t = text.trim().replace(/\s+/g, '').replace(/,/g, '');
  if (t === '') return null;
  const m = NUMBER.exec(t);
  if (!m) return null;
  const numText = m[1]!;
  const rest = m[2]!;
  // Prefer reading the rest as a prefix ("1f" is femto), then as prefix + unit ("10nF", "1F").
  let v = applyPrefix(numText, rest, unit);
  if (v === null) {
    const withoutUnit = stripUnit(rest, unit);
    if (withoutUnit !== null) v = applyPrefix(numText, withoutUnit, unit);
  }
  return v !== null && Number.isFinite(v) ? v : null;
}

const FORMAT_PREFIXES: [number, string][] = [
  [1e12, 'T'],
  [1e9, 'G'],
  [1e6, 'M'],
  [1e3, 'k'],
  [1, ''],
  [1e-3, 'm'],
  [1e-6, 'µ'],
  [1e-9, 'n'],
  [1e-12, 'p'],
  [1e-15, 'f'],
];

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/** Split a number into a mantissa string and SI prefix, using `sig` significant digits. */
export function siParts(x: number, sig = 4): { mantissa: string; prefix: string } {
  if (!Number.isFinite(x)) return { mantissa: Number.isNaN(x) ? '—' : x > 0 ? '∞' : '−∞', prefix: '' };
  if (x === 0) return { mantissa: '0', prefix: '' };
  const ax = Math.abs(x);
  // Round first so that 999.96 with 4 digits becomes 1.000k rather than 1000.
  const rounded = Number(ax.toPrecision(sig));
  let chosen = FORMAT_PREFIXES[FORMAT_PREFIXES.length - 1]!;
  for (const p of FORMAT_PREFIXES) {
    if (rounded >= p[0] * (1 - 1e-12)) {
      chosen = p;
      break;
    }
  }
  if (rounded >= 1e15 || rounded < 1e-15) {
    return { mantissa: trimZeros(x.toExponential(sig - 1)), prefix: '' };
  }
  const scaled = rounded / chosen[0];
  const intDigits = Math.max(1, Math.floor(Math.log10(scaled) + 1e-9) + 1);
  const decimals = Math.max(0, sig - intDigits);
  const sign = x < 0 ? '−' : '';
  return { mantissa: sign + trimZeros(scaled.toFixed(decimals)), prefix: chosen[1] };
}

/** Format for display, e.g. formatSI(15915.5, 'Ω') → "15.92 kΩ". */
export function formatSI(x: number, unit = '', sig = 4): string {
  const { mantissa, prefix } = siParts(x, sig);
  const u = prefix + unit;
  return u ? `${mantissa} ${u}` : mantissa;
}

/**
 * Format a value so that parseSI reads it back, e.g. 4700 → "4.7k". Used when a solved value
 * becomes an input. Uses plain ASCII ("u" for micro, "-" for minus).
 */
export function formatInput(x: number, sig = 6): string {
  const { mantissa, prefix } = siParts(x, sig);
  return (mantissa + (prefix === 'µ' ? 'u' : prefix)).replace('−', '-');
}

/** Format a plain number with `sig` significant digits and no prefix (for ratios, dB, degrees). */
export function formatNum(x: number, sig = 4): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? '—' : x > 0 ? '∞' : '−∞';
  if (x === 0) return '0';
  const ax = Math.abs(x);
  if (ax >= 1e6 || ax < 1e-4) return x.toExponential(sig - 1).replace('-', '−');
  const intDigits = Math.max(1, Math.floor(Math.log10(ax) + 1e-9) + 1);
  const s = trimZeros(x.toFixed(Math.max(0, sig - intDigits)));
  return s.replace('-', '−');
}

/** Format a relative error as a signed percentage, e.g. 0.0123 → "+1.23 %". */
export function formatPercent(err: number, sig = 3): string {
  if (!Number.isFinite(err)) return '—';
  const p = err * 100;
  if (Math.abs(p) < 5e-4) return '0 %';
  const s = formatNum(p, sig);
  return `${p > 0 ? '+' : ''}${s} %`;
}

/** Slew rate in V/µs without an SI prefix (0.018 V/µs rather than 18 mV/µs). */
export function formatSlew(voltsPerSecond: number): string {
  return `${formatNum(voltsPerSecond / 1e6, 3)} V/µs`;
}
