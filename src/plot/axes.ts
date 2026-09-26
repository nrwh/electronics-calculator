// Scales, ticks and axis drawing shared by the SVG plots.

import { esc } from '../schematic/markup';
import { formatNum, siParts } from '../lib/units';

export const PLOT_W = 640;
export const MARGIN = { left: 58, right: 18, top: 28, bottom: 34 };

export interface Scale {
  (v: number): number;
  domain: [number, number];
  range: [number, number];
}

export function linear(d0: number, d1: number, r0: number, r1: number): Scale {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const s = ((v: number) => r0 + (v - d0) * k) as Scale;
  s.domain = [d0, d1];
  s.range = [r0, r1];
  return s;
}

export function log(d0: number, d1: number, r0: number, r1: number): Scale {
  const l0 = Math.log10(d0);
  const l1 = Math.log10(d1);
  const k = (r1 - r0) / (l1 - l0);
  const s = ((v: number) => r0 + (Math.log10(v) - l0) * k) as Scale;
  s.domain = [d0, d1];
  s.range = [r0, r1];
  return s;
}

/** "Nice" 1-2-5 ticks covering [min, max]. */
export function niceTicks(
  min: number,
  max: number,
  target = 5,
): { ticks: number[]; min: number; max: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { ticks: [0, 1], min: 0, max: 1 };
  if (max - min < 1e-12 * Math.max(1, Math.abs(max))) {
    const pad = Math.abs(max) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return { ticks, min: lo, max: hi };
}

/** Decade ticks and 2–9 minor ticks for a log axis. */
export function logTicks(min: number, max: number): { major: number[]; minor: number[] } {
  const major: number[] = [];
  const minor: number[] = [];
  for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) {
    const d = 10 ** e;
    if (d >= min * 0.999 && d <= max * 1.001) major.push(d);
    for (let k = 2; k <= 9; k++) {
      const v = k * d;
      if (v > min && v < max) minor.push(v);
    }
  }
  return { major, minor };
}

/** Tick label with an SI prefix, e.g. 1000 → "1k", 0.002 → "2m". */
export function siTick(v: number, unit = ''): string {
  const { mantissa, prefix } = siParts(v, 3);
  return mantissa + prefix + unit;
}

export function plainTick(v: number): string {
  return formatNum(v, 3);
}

/** Plain numbers for everyday ranges (0.8, 12, 250), SI prefixes for very small or large ones (4.7µ, 2M). */
export function autoTickFormat(ticks: number[]): (v: number) => string {
  const max = Math.max(...ticks.map(Math.abs));
  return max >= 0.1 && max < 10000 ? plainTick : (v) => siTick(v, '');
}

export interface Frame {
  x: Scale;
  y: Scale;
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Grid lines, tick labels and axis titles for one panel. */
export function drawFrame(
  f: Frame,
  opts: {
    xTicks: number[];
    xMinor?: number[];
    yTicks: number[];
    xFormat: (v: number) => string;
    yFormat: (v: number) => string;
    xTitle?: string;
    yTitle: string;
    showXLabels: boolean;
  },
): string {
  const parts: string[] = [];
  for (const v of opts.xMinor ?? []) {
    const x = f.x(v);
    parts.push(`<line class="grid minor" x1="${x}" y1="${f.top}" x2="${x}" y2="${f.bottom}"/>`);
  }
  for (const v of opts.xTicks) {
    const x = f.x(v);
    parts.push(`<line class="grid" x1="${x}" y1="${f.top}" x2="${x}" y2="${f.bottom}"/>`);
    if (opts.showXLabels)
      parts.push(
        `<text class="tick" x="${x}" y="${f.bottom + 14}" text-anchor="middle">${esc(opts.xFormat(v))}</text>`,
      );
  }
  for (const v of opts.yTicks) {
    const y = f.y(v);
    parts.push(`<line class="grid" x1="${f.left}" y1="${y}" x2="${f.right}" y2="${y}"/>`);
    parts.push(
      `<text class="tick" x="${f.left - 6}" y="${y + 4}" text-anchor="end">${esc(opts.yFormat(v))}</text>`,
    );
  }
  parts.push(
    `<rect class="frame" x="${f.left}" y="${f.top}" width="${f.right - f.left}" height="${f.bottom - f.top}"/>`,
  );
  const cy = (f.top + f.bottom) / 2;
  parts.push(
    `<text class="axis-title" x="14" y="${cy}" text-anchor="middle" transform="rotate(-90 14 ${cy})">${esc(opts.yTitle)}</text>`,
  );
  if (opts.xTitle) {
    parts.push(
      `<text class="axis-title" x="${(f.left + f.right) / 2}" y="${f.bottom + 30}" text-anchor="middle">${esc(opts.xTitle)}</text>`,
    );
  }
  return parts.join('');
}

/** Polyline path through points, skipping non-finite values. */
export function linePath(xs: number[], ys: number[], sx: Scale, sy: Scale, clip?: [number, number]): string {
  let d = '';
  let pen = false;
  for (let i = 0; i < xs.length; i++) {
    let y = ys[i]!;
    if (!Number.isFinite(y)) {
      pen = false;
      continue;
    }
    if (clip) y = Math.min(Math.max(y, clip[0]), clip[1]);
    d += `${pen ? 'L' : 'M'}${sx(xs[i]!).toFixed(1)} ${sy(y).toFixed(1)}`;
    pen = true;
  }
  return d;
}

export function legend(
  items: { name: string; color: number; dashed?: boolean }[],
  x: number,
  y: number,
): string {
  let cx = x;
  return items
    .map((it) => {
      const s =
        `<line class="series s${it.color}${it.dashed ? ' dashed' : ''}" x1="${cx}" y1="${y - 4}" x2="${cx + 18}" y2="${y - 4}"/>` +
        `<text class="legend" x="${cx + 23}" y="${y}">${esc(it.name)}</text>`;
      cx += 32 + it.name.length * 6.5;
      return s;
    })
    .join('');
}

export function svgOpen(w: number, h: number, title: string, desc: string, id: string): string {
  return (
    `<svg class="plot" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="${id}-t ${id}-d">` +
    `<title id="${id}-t">${esc(title)}</title><desc id="${id}-d">${esc(desc)}</desc>`
  );
}

/** Pick about n evenly spaced indices for the data-table fallback. */
export function sampleIndices(len: number, n: number): number[] {
  if (len <= n) return Array.from({ length: len }, (_, i) => i);
  return Array.from({ length: n }, (_, i) => Math.round((i * (len - 1)) / (n - 1)));
}

export function rangeOf(arrays: number[][]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const a of arrays) {
    for (const v of a) {
      if (!Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return min <= max ? [min, max] : [0, 1];
}
