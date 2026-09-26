// Render a KiCad schematic (.kicad_sch) in the site's style: CSS classes and currentColor
// instead of KiCad's colours and stroke font, so it follows the theme and the page's text styles.
// Coordinates: KiCad works in mm; the site draws 2.54 mm (one 100 mil grid step) as 10 units.

import { plain } from '../../src/schematic/markup';
import { textSvg, varsIn, type Anchor, type KicadSchematic, type TextSlot } from '../../src/schematic/kicad';
import { all, atoms, flag, isList, num, one, parse, str, type SList } from './sexpr';

export const SCALE = 10 / 2.54;

/** Top-level items that carry nothing to draw. */
const IGNORED = new Set([
  'version',
  'generator',
  'generator_version',
  'uuid',
  'paper',
  'title_block',
  'lib_symbols',
  'sheet_instances',
  'symbol_instances',
  'embedded_fonts',
  'embedded_files',
]);
const DRAWN = new Set([
  'symbol',
  'wire',
  'junction',
  'no_connect',
  'label',
  'global_label',
  'hierarchical_label',
  'text',
  'polyline',
]);

/** Text the calculator fills in (it has a ${NAME}) looks like a value; the rest like a label. */
const textClass = (t: string): string => (varsIn(t).length ? 'sch-val' : 'sch-lbl');

/** Font sizes (user units) of the page's schematic text classes, for layout estimates. */
const FONT: Record<string, number> = { 'sch-ref': 11, 'sch-val': 12, 'sch-lbl': 11, st: 10 };
const CHAR = 0.55;

export type Pt = [number, number];
/** 2×2 matrix [a, b, c, d]: (x, y) → (a·x + b·y, c·x + d·y). */
export type Mat = [number, number, number, number];

export class KicadError extends Error {
  constructor(file: string, line: number, message: string) {
    super(`${file}:${line}: ${message}`);
  }
}

const r2 = (v: number): number => Math.round(v * 100) / 100;
export const apply = (m: Mat, [x, y]: Pt): Pt => [m[0] * x + m[1] * y, m[2] * x + m[3] * y];
const mul = (a: Mat, b: Mat): Mat => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
];
const inverse = (m: Mat): Mat => {
  const det = m[0] * m[3] - m[1] * m[2];
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det];
};
/** Library coordinates are y-up; the sheet is y-down. */
export const LIB_Y: Mat = [1, 0, 0, -1];

/**
 * A placed symbol's orientation on the sheet (y-down): rotate counter-clockwise on screen by
 * `angle`, then mirror. `(mirror x)` flips about the horizontal axis, `(mirror y)` about the
 * vertical. (The order matters at 90° and 270°; checked against KiCad's ERC.)
 */
export function symbolMatrix(angle: number, mirror: 'x' | 'y' | null): Mat {
  const t = (((angle % 360) + 360) % 360) * (Math.PI / 180);
  const c = Math.round(Math.cos(t));
  const s = Math.round(Math.sin(t));
  const rot: Mat = [c, s, -s, c];
  const mir: Mat = mirror === 'x' ? [1, 0, 0, -1] : mirror === 'y' ? [-1, 0, 0, 1] : [1, 0, 0, 1];
  return mul(mir, rot);
}

export interface Justify {
  h: 'left' | 'center' | 'right';
  v: 'top' | 'center' | 'bottom';
}

function justifyOf(effects: SList | undefined): Justify {
  const j = effects ? one(effects, 'justify') : undefined;
  const words = j ? atoms(j).map(String) : [];
  return {
    h: words.includes('left') ? 'left' : words.includes('right') ? 'right' : 'center',
    v: words.includes('top') ? 'top' : words.includes('bottom') ? 'bottom' : 'center',
  };
}

/** `(hide yes)` on the item or its effects, or the older bare `hide` in effects. */
function hidden(l: SList): boolean {
  const h = one(l, 'hide');
  return (h !== undefined && str(h) !== 'no') || flag(one(l, 'effects'), 'hide');
}

export interface Frame {
  origin: Pt;
  /** Orientation on the sheet (symbolMatrix), without the library y flip. */
  m: Mat;
  angle: number;
}

interface Placed {
  x: number;
  y: number;
  vertical: boolean;
  anchor: Anchor;
  box: [number, number, number, number];
}

/**
 * Where a text is drawn. KiCad lays the text box out from the anchor, justification and angle in
 * its owner's frame (a symbol's, or the sheet's), transforms the box, and draws the text in it.
 * Doing the same keeps labels where they are in KiCad even though the site's font differs. The
 * text is anchored at the box edge its KiCad anchor is on, so a filled-in value grows away from it.
 */
export function layoutText(
  anchor: Pt,
  angle: number,
  j: Justify,
  text: string,
  cls: string,
  frame: Frame | null,
): Placed {
  // KiCad keeps text readable: 180° draws as 0° and 270° as 90°, with the justification flipped.
  let a = ((Math.round(angle) % 360) + 360) % 360;
  let { h, v } = j;
  if (a === 180 || a === 270) {
    a -= 180;
    h = h === 'left' ? 'right' : h === 'right' ? 'left' : h;
    v = v === 'top' ? 'bottom' : v === 'bottom' ? 'top' : v;
  }
  const fs = FONT[cls] ?? 11;
  const w = Math.max(1, plain(text).length) * fs * CHAR;
  const m = frame?.m ?? [1, 0, 0, 1];
  const o = frame?.origin ?? [0, 0];
  const local = apply(inverse(m), [anchor[0] - o[0], anchor[1] - o[1]]);
  // Along the text (u) and across it (t, towards the bottom of the letters).
  const u0 = h === 'left' ? 0 : h === 'right' ? -w : -w / 2;
  const t0 = v === 'top' ? 0 : v === 'bottom' ? -fs : -fs / 2;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const u of [u0, u0 + w]) {
    for (const t of [t0, t0 + fs]) {
      // 0°: u runs +x and t runs +y. 90° reads bottom to top: u runs −y and t runs +x.
      const lp: Pt = a === 90 ? [local[0] + t, local[1] - u] : [local[0] + u, local[1] + t];
      const p = apply(m, lp);
      xs.push(p[0] + o[0]);
      ys.push(p[1] + o[1]);
    }
  }
  const box: [number, number, number, number] = [
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs),
    Math.max(...ys),
  ];
  const vertical = (((a + (frame?.angle ?? 0)) % 180) + 180) % 180 === 90;
  const near = (p: number, q: number): boolean => Math.abs(p - q) < 0.01;
  const midX = (box[0] + box[2]) / 2;
  const midY = (box[1] + box[3]) / 2;
  let x = midX;
  let y = midY;
  let anc: Anchor = 'middle';
  if (!vertical && h !== 'center') {
    if (near(anchor[0], box[0])) [x, anc] = [box[0], 'start'];
    else if (near(anchor[0], box[2])) [x, anc] = [box[2], 'end'];
  } else if (vertical && h !== 'center') {
    // Vertical text reads upwards, so it starts at the bottom of its box.
    if (near(anchor[1], box[3])) [y, anc] = [box[3], 'start'];
    else if (near(anchor[1], box[1])) [y, anc] = [box[1], 'end'];
  }
  return { x: r2(x), y: r2(y), vertical, anchor: anc, box };
}

// ---------- Library symbols ----------

interface LibSymbol {
  units: { unit: number; style: number; l: SList }[];
  pinNamesHidden: boolean;
  pinNameOffset: number;
}

function libSymbols(root: SList, file: string): Map<string, LibSymbol> {
  const out = new Map<string, LibSymbol>();
  const lib = one(root, 'lib_symbols');
  if (!lib) return out;
  for (const s of all(lib, 'symbol')) {
    const name = str(s)!;
    if (one(s, 'extends'))
      throw new KicadError(
        file,
        s.line,
        `symbol "${name}" extends another; save the file in KiCad to flatten it`,
      );
    const units = all(s, 'symbol').map((u) => {
      const m = /_(\d+)_(\d+)$/.exec(str(u) ?? '');
      if (!m) throw new KicadError(file, u.line, `unexpected unit name "${str(u)}"`);
      return { unit: Number(m[1]), style: Number(m[2]), l: u };
    });
    const pn = one(s, 'pin_names');
    out.set(name, {
      units,
      pinNamesHidden: pn ? hidden(pn) || flag(pn, 'hide') : false,
      pinNameOffset: pn ? num(one(pn, 'offset'), 0, 0.508) : 0.508,
    });
  }
  return out;
}

function fillClass(l: SList): string {
  const f = one(l, 'fill');
  const t = f ? str(one(f, 'type')) : undefined;
  return t === 'outline' || t === 'color' ? 'sf' : t === 'background' ? 'sb sbg' : 'sb';
}

const xy = (l: SList): Pt => [num(l, 0), num(l, 1)];

// ---------- Renderer ----------

class Out {
  readonly texts: (string | TextSlot)[] = [];
  readonly vars = new Set<string>();
  private box = [Infinity, Infinity, -Infinity, -Infinity];

  extend(x: number, y: number): void {
    const b = this.box;
    b[0] = Math.min(b[0]!, x);
    b[1] = Math.min(b[1]!, y);
    b[2] = Math.max(b[2]!, x);
    b[3] = Math.max(b[3]!, y);
  }

  path(pts: Pt[], cls: string, close = false): string {
    for (const p of pts) this.extend(p[0], p[1]);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${r2(p[0])} ${r2(p[1])}`).join(' ');
    return `<path class="${cls}" d="${d}${close ? ' Z' : ''}"/>`;
  }

  text(t: string, cls: string, at: Placed): void {
    if (!t.trim()) return;
    this.extend(at.box[0], at.box[1]);
    this.extend(at.box[2], at.box[3]);
    const names = varsIn(t);
    const { x, y, vertical, anchor } = at;
    if (names.length) {
      for (const n of names) this.vars.add(n);
      this.texts.push({ text: t, cls, x, y, vertical, anchor });
    } else this.texts.push(textSvg(cls, x, y, vertical, anchor, t));
  }

  viewBox(margin = 6): string {
    const [x0, y0, x1, y1] = this.box as [number, number, number, number];
    if (!Number.isFinite(x0)) return '0 0 10 10';
    const x = Math.floor(x0 - margin);
    const y = Math.floor(y0 - margin);
    return `${x} ${y} ${Math.ceil(x1 + margin) - x} ${Math.ceil(y1 + margin) - y}`;
  }
}

/** Parse and render a schematic. `file` is used in error messages. */
export function renderSchematic(text: string, file: string): KicadSchematic {
  let root: SList;
  try {
    root = parse(text);
  } catch (e) {
    const line = (e as { line?: number }).line ?? 1;
    throw new KicadError(file, line, (e as Error).message.replace(/^line \d+: /, ''));
  }
  if (root.head !== 'kicad_sch')
    throw new KicadError(file, 1, 'not a KiCad schematic (expected "kicad_sch")');
  const libs = libSymbols(root, file);
  const out = new Out();
  const wires: string[] = [];
  const bodies: string[] = [];
  const dots: string[] = [];
  const mm = ([x, y]: Pt): Pt => [x * SCALE, y * SCALE];

  for (const item of root.items) {
    if (!isList(item) || IGNORED.has(item.head)) continue;
    if (!DRAWN.has(item.head))
      throw new KicadError(file, item.line, `"${item.head}" is not supported in the site's schematics`);
    switch (item.head) {
      case 'wire':
      case 'polyline': {
        const pts = all(one(item, 'pts')!, 'xy').map((p) => mm(xy(p)));
        wires.push(out.path(pts, item.head === 'wire' ? 'sw' : 'sb'));
        break;
      }
      case 'junction': {
        const [x, y] = mm(xy(one(item, 'at')!));
        out.extend(x, y);
        dots.push(`<circle class="sf" cx="${r2(x)}" cy="${r2(y)}" r="2.6"/>`);
        break;
      }
      case 'no_connect': {
        const [x, y] = mm(xy(one(item, 'at')!));
        const d = 3;
        wires.push(
          out.path(
            [
              [x - d, y - d],
              [x + d, y + d],
            ],
            'sw',
          ) +
            out.path(
              [
                [x - d, y + d],
                [x + d, y - d],
              ],
              'sw',
            ),
        );
        break;
      }
      case 'symbol':
        bodies.push(drawSymbol(item));
        break;
      default: {
        // text and labels
        if (hidden(item)) break;
        const at = one(item, 'at')!;
        const t = str(item) ?? '';
        const cls = textClass(t);
        out.text(t, cls, layoutText(mm(xy(at)), num(at, 2), justifyOf(one(item, 'effects')), t, cls, null));
      }
    }
  }

  function drawSymbol(inst: SList): string {
    const libId = str(one(inst, 'lib_name')) ?? str(one(inst, 'lib_id'));
    const sym = libId ? libs.get(libId) : undefined;
    if (!sym) throw new KicadError(file, inst.line, `symbol "${libId}" is missing from lib_symbols`);
    const at = one(inst, 'at')!;
    const origin = mm(xy(at));
    const angle = num(at, 2);
    const mirror = str(one(inst, 'mirror'));
    const m = symbolMatrix(angle, mirror === 'x' || mirror === 'y' ? mirror : null);
    const toSheet = mul(m, LIB_Y);
    const unit = num(one(inst, 'unit'), 0, 1);
    const style = num(one(inst, 'body_style') ?? one(inst, 'convert'), 0, 1);
    const P = (p: Pt): Pt => {
      const q = apply(toSheet, [p[0] * SCALE, p[1] * SCALE]);
      return [origin[0] + q[0], origin[1] + q[1]];
    };
    const frame: Frame = { origin, m, angle };
    // KiCad paints background fills first, so a filled body never hides the graphics inside it.
    let bg = '';
    let svg = '';

    for (const u of sym.units) {
      if ((u.unit !== 0 && u.unit !== unit) || (u.style !== 0 && u.style !== style)) continue;
      for (const g of u.l.items) {
        if (!isList(g)) continue;
        const cls = fillClass(g);
        const emit = (s: string): void => {
          if (cls === 'sb sbg') bg += s;
          else svg += s;
        };
        switch (g.head) {
          case 'polyline': {
            const pts = all(one(g, 'pts')!, 'xy').map((p) => P(xy(p)));
            emit(out.path(pts, cls, cls !== 'sb' && pts.length > 2));
            break;
          }
          case 'rectangle': {
            const a = P(xy(one(g, 'start')!));
            const b = P(xy(one(g, 'end')!));
            emit(out.path([a, [b[0], a[1]], b, [a[0], b[1]]], cls, true));
            break;
          }
          case 'circle': {
            const [cx, cy] = P(xy(one(g, 'center')!));
            const r = num(one(g, 'radius')) * SCALE;
            out.extend(cx - r, cy - r);
            out.extend(cx + r, cy + r);
            emit(`<circle class="${cls}" cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}"/>`);
            break;
          }
          case 'arc':
            emit(arc(P(xy(one(g, 'start')!)), P(xy(one(g, 'mid')!)), P(xy(one(g, 'end')!)), cls));
            break;
          case 'bezier': {
            const pts = all(one(g, 'pts')!, 'xy').map((p) => P(xy(p)));
            for (const p of pts) out.extend(p[0], p[1]);
            const [a, b, c, d] = pts.map((p) => p.map(r2));
            if (a && b && c && d) emit(`<path class="${cls}" d="M${a} C${b} ${c} ${d}"/>`.replace(/,/g, ' '));
            break;
          }
          case 'text': {
            if (hidden(g)) break;
            const ta = one(g, 'at')!;
            const t = str(g) ?? '';
            out.text(
              t,
              'st',
              layoutText(P(xy(ta)), num(ta, 2), justifyOf(one(g, 'effects')), t, 'st', frame),
            );
            break;
          }
          case 'pin':
            svg += pin(g, P, frame, sym);
            break;
        }
      }
    }

    // Fields: Reference, Value and any other visible property, where KiCad puts them.
    const props = all(inst, 'property');
    const fields = new Map(props.map((p) => [(str(p, 0) ?? '').toUpperCase(), str(p, 1) ?? '']));
    for (const p of props) {
      if (hidden(p)) continue;
      const name = str(p, 0) ?? '';
      // ${FIELD} naming another field of the same symbol is resolved here, as KiCad does.
      let t = (str(p, 1) ?? '').replace(/\$\{([A-Za-z0-9_.]+)\}/g, (whole, v: string) => {
        const k = v.toUpperCase();
        return fields.has(k) && k !== name.toUpperCase() ? fields.get(k)! : whole;
      });
      if (!t) continue;
      if (flag(p, 'show_name')) t = `${name}: ${t}`;
      const cls = name === 'Reference' ? 'sch-ref' : textClass(t);
      const pa = one(p, 'at')!;
      out.text(t, cls, layoutText(mm(xy(pa)), num(pa, 2), justifyOf(one(p, 'effects')), t, cls, frame));
    }
    return bg + svg;
  }

  function pin(g: SList, P: (p: Pt) => Pt, frame: Frame, sym: LibSymbol): string {
    if (hidden(g) || atoms(g).includes('hide')) return '';
    const at = one(g, 'at')!;
    const [px, py] = xy(at);
    const len = num(one(g, 'length'));
    const t = (num(at, 2) * Math.PI) / 180;
    // Direction from the connection point into the body (library coordinates, y up).
    const d: Pt = [Math.round(Math.cos(t)), Math.round(Math.sin(t))];
    const end: Pt = [px + d[0] * len, py + d[1] * len];
    const shape = String(atoms(g)[1] ?? 'line');
    const clock = shape.includes('clock');
    const bubble = shape === 'inverted' || shape === 'inverted_clock';
    const r = 0.635;
    let svg = '';
    const lineEnd: Pt = bubble ? [end[0] - d[0] * 2 * r, end[1] - d[1] * 2 * r] : end;
    if (len > 0) svg += out.path([P([px, py]), P(lineEnd)], 'sb');
    if (bubble) {
      const [cx, cy] = P([end[0] - d[0] * r, end[1] - d[1] * r]);
      svg += `<circle class="sb sbg" cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r * SCALE)}"/>`;
    }
    if (clock) {
      // A small triangle inside the body, pointing along the pin.
      const n: Pt = [-d[1], d[0]];
      const s = 0.635;
      svg += out.path(
        [
          P([end[0] + n[0] * s, end[1] + n[1] * s]),
          P([end[0] + d[0] * s, end[1] + d[1] * s]),
          P([end[0] - n[0] * s, end[1] - n[1] * s]),
        ],
        'sb',
      );
    }
    const name = str(one(g, 'name')) ?? '';
    if (sym.pinNamesHidden || !name || name === '~') return svg;
    const horizontal = d[0] !== 0;
    if (sym.pinNameOffset > 0) {
      // Inside the body, just past the pin's inner end, reading away from the pin.
      const o = sym.pinNameOffset + (clock ? 0.9 : 0);
      const a = P([end[0] + d[0] * o, end[1] + d[1] * o]);
      const j: Justify = { h: (horizontal ? d[0] : d[1]) > 0 ? 'left' : 'right', v: 'center' };
      out.text(name, 'st', layoutText(a, horizontal ? 0 : 90, j, name, 'st', frame));
    } else {
      // Offset 0: above the pin line.
      const mid = P([px + (d[0] * len) / 2, py + (d[1] * len) / 2]);
      out.text(
        name,
        'st',
        layoutText(mid, horizontal ? 0 : 90, { h: 'center', v: 'bottom' }, name, 'st', frame),
      );
    }
    return svg;
  }

  function arc(a: Pt, b: Pt, c: Pt, cls: string): string {
    // The circle through the three points.
    const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    if (Math.abs(d) < 1e-9) return out.path([a, c], cls);
    const sq = (p: Pt): number => p[0] * p[0] + p[1] * p[1];
    const ux = (sq(a) * (b[1] - c[1]) + sq(b) * (c[1] - a[1]) + sq(c) * (a[1] - b[1])) / d;
    const uy = (sq(a) * (c[0] - b[0]) + sq(b) * (a[0] - c[0]) + sq(c) * (b[0] - a[0])) / d;
    const r = r2(Math.hypot(a[0] - ux, a[1] - uy));
    const cross = (o: Pt, p: Pt, q: Pt): number =>
      (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
    // On a y-down sheet a positive cross product turns clockwise, which is SVG's sweep = 1.
    const sweep = cross(a, b, c) > 0 ? 1 : 0;
    // The arc is the long way round when the midpoint is on the same side of the chord as the centre.
    const large = Math.sign(cross(a, c, b)) === Math.sign(cross(a, c, [ux, uy])) ? 1 : 0;
    for (const p of [a, b, c]) out.extend(p[0], p[1]);
    return `<path class="${cls}" d="M${r2(a[0])} ${r2(a[1])} A${r} ${r} 0 ${large} ${sweep} ${r2(c[0])} ${r2(c[1])}"/>`;
  }

  // Wires under symbols, symbols under junction dots, text on top.
  const parts: (string | TextSlot)[] = [wires.join('') + bodies.join('') + dots.join('')];
  for (const t of out.texts) {
    const last = parts[parts.length - 1];
    if (typeof t === 'string' && typeof last === 'string') parts[parts.length - 1] = last + t;
    else parts.push(t);
  }
  return { file, viewBox: out.viewBox(), parts, vars: [...out.vars].sort() };
}
