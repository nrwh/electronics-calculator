// Schematics drawn in KiCad. build/kicad-plugin.ts turns each imported .kicad_sch file into a
// KicadSchematic at build time; kicad() fills in the calculator's ${NAME} text variables.

import { esc, markup } from './markup';

export interface SchematicDoc {
  svg: string;
  title: string;
  desc: string;
}

export type Anchor = 'start' | 'middle' | 'end';

/** A text whose content has ${NAME} variables, drawn once the calculator supplies them. */
export interface TextSlot {
  text: string;
  x: number;
  y: number;
  vertical: boolean;
  anchor: Anchor;
  cls: string;
}

export interface KicadSchematic {
  /** Repo-relative path, for error messages. */
  file: string;
  viewBox: string;
  /** Static SVG markup and text slots, in drawing order. */
  parts: (string | TextSlot)[];
  /** Every ${NAME} the schematic uses. */
  vars: string[];
}

const VAR = /\$\{([A-Za-z0-9_.]+)\}/g;

/**
 * An SVG <text> vertically centred on y, anchored at x. Vertical text reads bottom to top, as in
 * KiCad.
 */
export function textSvg(
  cls: string,
  x: number,
  y: number,
  vertical: boolean,
  anchor: Anchor,
  content: string,
): string {
  const rot = vertical ? ` transform="rotate(-90 ${x} ${y})"` : '';
  return `<text class="${cls}" x="${x}" y="${y}" dy="0.35em" text-anchor="${anchor}"${rot}>${markup(content)}</text>`;
}

/**
 * Render a KiCad schematic with the calculator's values. Every ${NAME} in the schematic must be
 * supplied, and every supplied name must be used, so a typo fails loudly (and in the tests).
 */
export function kicad(
  sch: KicadSchematic,
  opts: { title: string; desc: string; vars?: Record<string, string> },
): SchematicDoc {
  const vars = opts.vars ?? {};
  const missing = sch.vars.filter((v) => !(v in vars));
  if (missing.length)
    throw new Error(`${sch.file}: no value given for ${missing.map((v) => `\${${v}}`).join(', ')}`);
  const unused = Object.keys(vars).filter((v) => !sch.vars.includes(v));
  if (unused.length)
    throw new Error(`${sch.file}: the schematic has no ${unused.map((v) => `\${${v}}`).join(', ')}`);

  let body = '';
  for (const p of sch.parts) {
    if (typeof p === 'string') {
      body += p;
      continue;
    }
    const text = p.text.replace(VAR, (_, name: string) => vars[name]!);
    body += textSvg(p.cls, p.x, p.y, p.vertical, p.anchor, text);
  }
  const svg =
    `<svg class="schematic" viewBox="${sch.viewBox}" role="img" aria-labelledby="sch-title sch-desc" preserveAspectRatio="xMidYMid meet">` +
    `<title id="sch-title">${esc(opts.title)}</title><desc id="sch-desc">${esc(opts.desc)}</desc>` +
    body +
    `</svg>`;
  return { svg, title: opts.title, desc: opts.desc };
}

/** The ${NAME} variables used in a text. */
export function varsIn(text: string): string[] {
  return Array.from(text.matchAll(VAR), (m) => m[1]!);
}
