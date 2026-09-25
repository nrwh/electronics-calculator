// Headline results (top panel) and the full results table (Results tab).

import type { AnyCalculatorDef, ResultRow } from '../calculators/types';
import type { PipelineResult } from '../lib/pipeline';
import { unitOf } from '../lib/pipeline';
import { formatPercent } from '../lib/units';
import { h, replace, sym } from './h';
import { achievedExtras, formatValue, headlineHtml, spreadText } from './markup';

export { formatValue };

export function renderHeadline(
  container: HTMLElement,
  def: AnyCalculatorDef,
  r: PipelineResult,
  rows: ResultRow[],
): void {
  container.innerHTML = headlineHtml(def, r, rows);
}

function table(head: string[], body: Node[]): HTMLTableElement {
  return h(
    'table',
    { class: 'results-table' },
    h(
      'thead',
      null,
      h(
        'tr',
        null,
        head.map((t) => h('th', { scope: 'col' }, t)),
      ),
    ),
    h('tbody', null, body),
  );
}

export function renderResultsTab(
  container: HTMLElement,
  def: AnyCalculatorDef,
  r: PipelineResult,
  rows: ResultRow[],
): void {
  const parts: Node[] = [h('h2', { class: 'panel-title' }, 'Results')];

  // Solved values: ideal → chosen value → error, plus spread where available.
  const solvedKeys = Object.keys(r.solved);
  if (solvedKeys.length || r.compare.length) {
    const body: Node[] = [];
    for (const key of solvedKeys) {
      const d = def.vars[key]!;
      const s = r.solved[key]!;
      const unit = unitOf(d);
      body.push(
        h(
          'tr',
          null,
          h(
            'th',
            { scope: 'row' },
            d.label,
            d.symbol ? [' ', h('i', null, sym(d.symbol))] : null,
            h('span', { class: 'muted' }, ' (solved)'),
          ),
          h('td', { class: 'num' }, formatValue(s.ideal, unit)),
          h('td', { class: 'num' }, s.snapped ? formatValue(s.value, unit) : '—'),
          h('td', { class: 'num' }, s.snapped ? formatPercent(s.err) : '—'),
          h('td', { class: 'num muted' }, spreadText(r, key, unit) ?? ''),
        ),
      );
    }
    for (const c of r.compare) {
      const d = def.vars[c.key]!;
      const unit = unitOf(d);
      body.push(
        h(
          'tr',
          null,
          h(
            'th',
            { scope: 'row' },
            d.label,
            d.symbol ? [' ', h('i', null, sym(d.symbol))] : null,
            h('span', { class: 'muted' }, ' (target)'),
          ),
          h('td', { class: 'num' }, formatValue(c.target, unit)),
          h('td', { class: 'num' }, formatValue(c.achieved, unit)),
          h('td', { class: 'num' }, formatPercent(c.err)),
          h('td', { class: 'num muted' }, spreadText(r, c.key, unit) ?? ''),
        ),
      );
    }
    parts.push(h('h3', null, 'Design values'));
    parts.push(table(['Quantity', 'Ideal / target', 'Chosen / achieved', 'Error', 'Tolerance spread'], body));
  }

  // Calculator rows, grouped.
  const groups = new Map<string, ResultRow[]>();
  for (const row of rows) {
    const g = row.group ?? 'Results';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(row);
  }
  for (const [g, list] of groups) {
    parts.push(h('h3', null, g));
    parts.push(
      table(
        ['Quantity', 'Value', 'Notes'],
        list.map((row) =>
          h(
            'tr',
            null,
            h(
              'th',
              { scope: 'row' },
              row.label,
              row.symbol ? [' ', h('i', { class: 'muted' }, sym(row.symbol))] : null,
            ),
            h(
              'td',
              { class: `num${row.status ? ` status-${row.status}` : ''}` },
              formatValue(row.value, row.unit, row.sig),
            ),
            h(
              'td',
              { class: 'muted' },
              [row.note, ...achievedExtras(r, row, def)].filter(Boolean).join('; '),
            ),
          ),
        ),
      ),
    );
  }
  replace(container, parts);
}
