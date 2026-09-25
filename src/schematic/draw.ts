// Grid layout API for schematics: place(symbol, x, y, rot), wire(points), label().
// Positions are in grid units (1 unit = 10 SVG user units).

import type { SymbolDef } from './symbols';
import { dot as dotSym } from './symbols';

export const U = 10;

export type Pt = [number, number];
export type Rot = 0 | 90 | 180 | 270;
export type Side = 'above' | 'below' | 'left' | 'right';

export interface SchematicDoc {
  svg: string;
  title: string;
  desc: string;
}

export interface Placed {
  /** Pin position in grid units. */
  pin(name: string): Pt;
}

export interface PlaceOptions {
  rot?: Rot;
  /** Designator, e.g. "R1". */
  ref?: string;
  /** Value label, e.g. "16 kΩ". */
  value?: string;
  /** Which side of the symbol the labels go on (default: above when horizontal, right when vertical). */
  side?: Side;
  /** Mirror vertically (before rotation), e.g. an op-amp with + on top. */
  flip?: boolean;
  /** Put ref and value on one line ("R_f 16 kΩ") where space is tight. */
  inline?: boolean;
  /** Put the labels at this grid position instead (first line's baseline), with this anchor. */
  labelAt?: Pt;
  labelAnchor?: 'start' | 'middle' | 'end';
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Text with subscripts: "R_f" → R with subscript f, "f_{c,min}" → f with subscript "c,min".
 * Returns SVG tspan markup.
 */
export function rich(s: string): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const u = s.indexOf('_', i);
    if (u < 0) {
      out += esc(s.slice(i));
      break;
    }
    out += esc(s.slice(i, u));
    let sub: string;
    let next: number;
    if (s[u + 1] === '{') {
      const close = s.indexOf('}', u + 2);
      sub = s.slice(u + 2, close < 0 ? s.length : close);
      next = close < 0 ? s.length : close + 1;
    } else {
      const m = /^[A-Za-z0-9]+/.exec(s.slice(u + 1));
      sub = m ? m[0] : '';
      next = u + 1 + sub.length;
    }
    out += `<tspan dy="3" font-size="75%">${esc(sub)}</tspan>`;
    if (next < s.length) out += '<tspan dy="-3">​</tspan>';
    i = next;
  }
  return out;
}

function rotate([x, y]: Pt, rot: Rot): Pt {
  switch (rot) {
    case 0:
      return [x, y];
    case 90:
      return [-y, x];
    case 180:
      return [-x, -y];
    case 270:
      return [y, -x];
  }
}

export class Sheet {
  private readonly items: string[] = [];
  private readonly wires: string[] = [];
  private readonly texts: string[] = [];

  /** Width and height in grid units. */
  constructor(
    readonly width: number,
    readonly height: number,
    readonly title: string,
    readonly desc: string,
  ) {}

  place(sym: SymbolDef, x: number, y: number, opts: PlaceOptions = {}): Placed {
    const rot = opts.rot ?? 0;
    const flip = opts.flip ?? false;
    const transform = `translate(${x * U} ${y * U})${rot ? ` rotate(${rot})` : ''}${flip ? ' scale(1 -1)' : ''}`;
    this.items.push(`<g transform="${transform}">${sym.body}</g>`);
    const pinAt = (name: string): Pt => {
      const p = sym.pins[name];
      if (!p) throw new Error(`Symbol has no pin "${name}"`);
      const local: Pt = flip ? [p[0], -p[1]] : p;
      const r = rotate(local, rot);
      return [x + r[0], y + r[1]];
    };
    if (opts.ref || opts.value) this.labelFor(sym, x, y, opts, pinAt);
    return { pin: pinAt };
  }

  private labelFor(sym: SymbolDef, x: number, y: number, opts: PlaceOptions, pinAt: (n: string) => Pt): void {
    const pins = Object.keys(sym.pins);
    const lines = { ref: opts.ref, value: opts.value, inline: opts.inline ?? false };
    if (opts.labelAt) {
      this.stack(opts.labelAt[0] * U, opts.labelAt[1] * U, opts.labelAnchor ?? 'start', lines, 1);
      return;
    }
    if (pins.length !== 2) {
      // Multi-pin symbols: use the symbol's own label position (rotation 0 only).
      const side = opts.side ?? 'below';
      this.stack(
        x * U + sym.labelH[0],
        y * U + sym.labelH[1],
        sym.labelAnchor ?? 'middle',
        lines,
        side === 'above' ? -1 : 1,
      );
      return;
    }
    const [ax, ay] = pinAt(pins[0]!);
    const [bx, by] = pinAt(pins[1]!);
    const mx = ((ax + bx) / 2) * U;
    const my = ((ay + by) / 2) * U;
    // Judge orientation from the pins, so symbols drawn vertically (sources) count as vertical.
    const vertical = Math.abs(bx - ax) < Math.abs(by - ay);
    const side: Side = opts.side ?? (vertical ? 'right' : 'above');
    const offH = Math.abs(sym.labelH[1]);
    const offV = Math.abs(sym.labelV[0]);
    switch (side) {
      case 'above':
        this.stack(mx, my - offH, 'middle', lines, -1);
        break;
      case 'below':
        this.stack(mx, my + offH + 10, 'middle', lines, 1);
        break;
      case 'right':
        this.stack(mx + offV, my, 'start', lines, 0);
        break;
      case 'left':
        this.stack(mx - offV, my, 'end', lines, 0);
        break;
    }
  }

  /** Ref above value (or on one line). dir −1 grows upward from y, +1 downward, 0 centres on y. */
  private stack(
    x: number,
    y: number,
    anchor: string,
    l: { ref?: string; value?: string; inline: boolean },
    dir: number,
  ): void {
    if (l.inline) {
      const parts = [
        l.ref ? `<tspan class="sch-ref">${rich(l.ref)}</tspan>` : '',
        l.value ? `<tspan class="sch-val">${rich(l.value)}</tspan>` : '',
      ].filter(Boolean);
      const yy = dir === 0 ? y + 4 : y;
      this.texts.push(`<text x="${x}" y="${yy}" text-anchor="${anchor}">${parts.join(' ')}</text>`);
      return;
    }
    const lines: [string, string][] = [];
    if (l.ref) lines.push([l.ref, 'sch-ref']);
    if (l.value) lines.push([l.value, 'sch-val']);
    const lh = 13;
    let y0: number;
    if (dir < 0) y0 = y - (lines.length - 1) * lh;
    else if (dir > 0) y0 = y;
    else y0 = y + 4 - ((lines.length - 1) * lh) / 2;
    lines.forEach(([t, cls], i) => {
      this.texts.push(
        `<text class="${cls}" x="${x}" y="${y0 + i * lh}" text-anchor="${anchor}">${rich(t)}</text>`,
      );
    });
  }

  /** A wire through the given points (grid units). */
  wire(...pts: Pt[]): this {
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0] * U} ${p[1] * U}`).join(' ');
    this.wires.push(`<path class="sw" d="${d}"/>`);
    return this;
  }

  /** Junction dot. */
  dot(p: Pt): this {
    this.place(dotSym, p[0], p[1]);
    return this;
  }

  /** Free text at a grid position; `dx`/`dy` nudge it in user units. */
  text(
    p: Pt,
    s: string,
    opts: { anchor?: 'start' | 'middle' | 'end'; cls?: string; dx?: number; dy?: number } = {},
  ): this {
    const { anchor = 'start', cls = 'sch-lbl', dx = 0, dy = 0 } = opts;
    this.texts.push(
      `<text class="${cls}" x="${p[0] * U + dx}" y="${p[1] * U + dy}" text-anchor="${anchor}">${rich(s)}</text>`,
    );
    return this;
  }

  render(): SchematicDoc {
    const w = this.width * U;
    const h = this.height * U;
    const svg =
      `<svg class="schematic" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="sch-title sch-desc" preserveAspectRatio="xMidYMid meet">` +
      `<title id="sch-title">${esc(this.title)}</title><desc id="sch-desc">${esc(this.desc)}</desc>` +
      this.wires.join('') +
      this.items.join('') +
      this.texts.join('') +
      `</svg>`;
    return { svg, title: this.title, desc: this.desc };
  }
}
