// KiCad text markup to SVG: "V_{out}" → subscript, "x^{2}" → superscript, "~{Q}" → overbar.
// Shared by the build-time KiCad importer and the page, so filled-in values render the same way.

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Brings the baseline back after a sub- or superscript without adding visible width. */
const ZWSP = '\u200b';

/** SVG <tspan> markup for a text with KiCad markup. Nested markup is not supported. */
export function markup(s: string): string {
  let out = '';
  let i = 0;
  const re = /([_^~])\{([^}]*)\}/g;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    out += esc(s.slice(i, m.index));
    const [, kind, inner] = m;
    if (kind === '_')
      out += `<tspan dy="3" font-size="75%">${esc(inner!)}</tspan><tspan dy="-3">${ZWSP}</tspan>`;
    else if (kind === '^')
      out += `<tspan dy="-4" font-size="75%">${esc(inner!)}</tspan><tspan dy="4">${ZWSP}</tspan>`;
    else out += `<tspan text-decoration="overline">${esc(inner!)}</tspan>`;
    i = m.index + m[0].length;
  }
  return out + esc(s.slice(i));
}

/** The text without markup, e.g. for width estimates: "V_{out}" → "Vout". */
export function plain(s: string): string {
  return s.replace(/[_^~]\{([^}]*)\}/g, '$1');
}
