// Pure string renderers for the calculator's top panel. The build uses them to pre-render the
// default design into each page, and the browser uses the same functions, so the markup matches
// and nothing moves when the script takes over. No DOM access here.

import type { AnyCalculatorDef, PartType, ResultRow, Settings, VarDef } from '../calculators/types';
import { SERIES_NAMES } from '../lib/eseries';
import { findOption, unitOf, type PipelineResult } from '../lib/pipeline';
import { formatNum, formatPercent, formatSI, siParts } from '../lib/units';

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Symbol text with subscripts: "f_c" → f<sub>c</sub>, "V_{in,max}" → V<sub>in,max</sub>. */
export function symHtml(s: string): string {
  let out = '';
  let last = 0;
  const re = /_(\{[^}]*\}|[A-Za-z0-9]+)/g;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    out += esc(s.slice(last, m.index));
    const sub = m[1]!.startsWith('{') ? m[1]!.slice(1, -1) : m[1]!;
    out += `<sub>${esc(sub)}</sub>`;
    last = m.index + m[0].length;
  }
  return out + esc(s.slice(last));
}

const NO_PREFIX = new Set(['dB', '°', '%', 'V/V', 'A/A', 'V/µs', '×', '', 'levels', 'gates', 'packages']);

/** Format a value with its unit: SI prefixes for physical units, plain numbers for dB, degrees, ratios. */
export function formatValue(v: number | string, unit = '', sig = 4): string {
  if (typeof v === 'string') return unit ? `${v} ${unit}` : v;
  if (NO_PREFIX.has(unit)) return unit ? `${formatNum(v, sig)} ${unit}` : formatNum(v, sig);
  return formatSI(v, unit, sig);
}

export function spreadText(r: PipelineResult, key: string, unit: string): string | null {
  const s = r.spread[key];
  if (!s || s.max <= s.min * (1 + 1e-9)) return null;
  return `${formatValue(s.min, unit, 3)} to ${formatValue(s.max, unit, 3)} over tolerances`;
}

/**
 * Extra lines for a result tied to an achieved variable: target and error, and the tolerance
 * spread. `compact` gives the short form used in the top panel.
 */
export function achievedExtras(
  r: PipelineResult,
  row: ResultRow,
  def: AnyCalculatorDef,
  compact = false,
): string[] {
  const out: string[] = [];
  if (!row.achieved) return out;
  const unit = row.unit ?? unitOf(def.vars[row.achieved]!);
  const cmp = r.compare.find((c) => c.key === row.achieved);
  if (cmp) {
    out.push(
      compact
        ? `target ${formatValue(cmp.target, unit)} (${formatPercent(cmp.err)})`
        : `target ${formatValue(cmp.target, unit)}, error ${formatPercent(cmp.err)}`,
    );
  }
  const s = r.spread[row.achieved];
  if (compact && s && s.max > s.min * (1 + 1e-9)) {
    out.push(`tol. ${formatValue(s.min, unit, 3)} – ${formatValue(s.max, unit, 3)}`);
  } else if (!compact) {
    const sp = spreadText(r, row.achieved, unit);
    if (sp) out.push(sp);
  }
  return out;
}

export function headlineHtml(def: AnyCalculatorDef, r: PipelineResult, rows: ResultRow[]): string {
  return rows
    .filter((row) => row.headline)
    .map((row) => {
      const extras = achievedExtras(r, row, def, true).join(' · ');
      return (
        `<div class="hl-item"><span class="hl-label">${esc(row.label)}${row.symbol ? ` <i>${symHtml(row.symbol)}</i>` : ''}</span>` +
        `<span class="hl-value${row.status ? ` status-${row.status}` : ''}">${esc(formatValue(row.value, row.unit, row.sig))}</span>` +
        (extras ? `<span class="hl-extra" title="${esc(extras)}">${esc(extras)}</span>` : '') +
        `</div>`
      );
    })
    .join('');
}

export function messagesHtml(def: AnyCalculatorDef, r: PipelineResult): string {
  const items: string[] = [];
  for (const e of r.errors)
    items.push(`<div class="msg error" role="alert"><strong>Error: </strong>${symHtml(e)}</div>`);
  const nFieldErrors = Object.keys(r.fieldErrors).length;
  if (!r.ok && !r.errors.length && nFieldErrors) {
    items.push(
      `<div class="msg error"><strong>Error: </strong>fix the highlighted field${nFieldErrors > 1 ? 's' : ''}. Showing the last valid design.</div>`,
    );
  }
  if (r.ok) {
    for (const w of r.warnings) {
      const label = w.field ? `${esc(def.vars[w.field]?.label ?? w.field)}: ` : '';
      items.push(`<div class="msg warn"><strong>Warning: </strong>${label}${symHtml(w.message)}</div>`);
    }
  }
  return items.join('');
}

export function solveControlHtml(def: AnyCalculatorDef, current: string): string {
  const options = def.solveFor
    .map(
      (o) =>
        `<label><input type="radio" name="solve" value="${esc(o.id)}"${o.id === current ? ' checked' : ''}><span>${symHtml(o.label)}</span></label>`,
    )
    .join('');
  return `<fieldset class="solve"${def.solveFor.length < 2 ? ' hidden' : ''}><legend>Solve for</legend><div class="seg">${options}</div></fieldset>`;
}

export interface FieldView {
  text: string;
  message: string;
  error: boolean;
  solved: boolean;
  hidden: boolean;
}

/** Display text for a solved value in its (read-only) field, e.g. "16k", "994.7". */
export function solvedText(value: number, isInt: boolean): string {
  if (isInt) return String(value);
  const { mantissa, prefix } = siParts(value, 4);
  return mantissa + prefix;
}

/** What a field shows for the current state and pipeline result. */
export function fieldView(
  def: AnyCalculatorDef,
  key: string,
  raw: Record<string, string>,
  solve: string,
  settings: Settings,
  r: PipelineResult | null,
): FieldView {
  const d = def.vars[key]!;
  const option = findOption(def, solve);
  const solved = option.targets.includes(key);
  const hiddenByChoice = d.showIf ? !d.showIf.values.includes(raw[d.showIf.key] ?? '') : false;
  const hidden = hiddenByChoice || (option.unused ?? []).includes(key);
  const unit = unitOf(d);
  const view: FieldView = { text: raw[key] ?? d.default, message: '', error: false, solved, hidden };
  if (solved) {
    const s = r?.ok ? r.solved[key] : undefined;
    if (!s) {
      view.text = '—';
      const err = r?.fieldErrors[key];
      if (err) Object.assign(view, { message: err, error: true });
      return view;
    }
    view.text = solvedText(s.value, d.kind === 'int');
    if (d.kind === 'part') {
      view.message = s.snapped
        ? `ideal ${formatValue(s.ideal, unit)} · ${settings.series[d.part]} ${formatPercent(s.err)}`
        : 'exact value (no series)';
    }
    return view;
  }
  if (!r) return view;
  const err = r.fieldErrors[key];
  if (err) return { ...view, message: err, error: true };
  if (d.kind === 'part' && r.offSeries.includes(key))
    return { ...view, message: `not in ${settings.series[d.part]}` };
  if (r.ok) {
    const cmp = r.compare.find((c) => c.key === key);
    if (cmp) view.message = `achieved ${formatValue(cmp.achieved, unit)} (${formatPercent(cmp.err)})`;
  }
  return view;
}

export function fieldHtml(key: string, d: VarDef, view: FieldView): string {
  const id = `f-${esc(key)}`;
  const msgId = `${id}-msg`;
  const label = `<label for="${id}" title="${esc(d.help ?? d.label)}">${esc(d.label)}${d.symbol ? `<span class="sym">${symHtml(d.symbol)}</span>` : ''}</label>`;
  let control: string;
  if (d.kind === 'choice') {
    const opts = d.options
      .map(
        (o) =>
          `<option value="${esc(o.value)}"${o.value === view.text ? ' selected' : ''}>${esc(o.label)}</option>`,
      )
      .join('');
    control = `<select id="${id}" aria-describedby="${msgId}">${opts}</select>`;
  } else {
    control =
      `<input id="${id}" type="text" inputmode="${d.kind === 'int' ? 'numeric' : 'text'}" autocomplete="off" spellcheck="false" aria-describedby="${msgId}" value="${esc(view.text)}"` +
      (view.solved ? ' readonly aria-readonly="true" tabindex="-1"' : ' aria-readonly="false"') +
      ` aria-invalid="${view.error}">`;
  }
  const unit = unitOf(d);
  const mark = `<span class="solved-mark"${view.solved ? '' : ' hidden'}>solved</span>`;
  const wrap = `<div class="input-wrap">${control}${mark}${unit ? `<span class="unit" aria-hidden="true">${esc(unit)}</span>` : ''}</div>`;
  const cls = `field${view.solved ? ' solved' : ''}${view.error ? ' has-error' : ''}`;
  return `<div class="${cls}" data-key="${esc(key)}"${view.hidden ? ' hidden' : ''}>${label}${wrap}<div class="field-msg${view.error ? ' error' : ''}" id="${msgId}">${esc(view.message)}</div></div>`;
}

export const TOLERANCES = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20] as const;
export const PART_NAMES: Record<PartType, string> = { R: 'Resistors', C: 'Capacitors', L: 'Inductors' };

export function settingsBarHtml(types: PartType[], settings: Settings): string {
  return types
    .map((t) => {
      const series = [...SERIES_NAMES, 'none']
        .map(
          (n) =>
            `<option value="${n}"${settings.series[t] === n ? ' selected' : ''}>${n === 'none' ? 'Any value' : n}</option>`,
        )
        .join('');
      const tols: number[] = [...TOLERANCES];
      if (!tols.includes(settings.tol[t])) tols.push(settings.tol[t]);
      const tol = tols
        .sort((a, b) => a - b)
        .map((v) => `<option value="${v}"${settings.tol[t] === v ? ' selected' : ''}>±${v} %</option>`)
        .join('');
      return (
        `<div class="setting"><span class="setting-name">${t}</span>` +
        `<select id="set-e${t}" aria-label="${PART_NAMES[t]} series">${series}</select>` +
        `<select id="set-t${t}" aria-label="${PART_NAMES[t]} tolerance">${tol}</select></div>`
      );
    })
    .join('');
}

export interface TopPanel {
  settings: string;
  solve: string;
  fields: string;
  headline: string;
  messages: string;
  schematic: string;
}

/** The whole top panel for a state, as HTML strings. */
export function topPanelHtml(
  def: AnyCalculatorDef,
  types: PartType[],
  raw: Record<string, string>,
  solve: string,
  settings: Settings,
  r: PipelineResult,
): TopPanel {
  const rows = r.ok ? def.results(r.values!, r.out, settings) : [];
  return {
    settings: settingsBarHtml(types, settings),
    solve: solveControlHtml(def, solve),
    fields: Object.entries(def.vars)
      .map(([key, d]) => fieldHtml(key, d, fieldView(def, key, raw, solve, settings, r)))
      .join(''),
    headline: r.ok ? headlineHtml(def, r, rows) : '',
    messages: messagesHtml(def, r),
    schematic: r.ok ? def.schematic(r.values!, r.out).svg : '',
  };
}
