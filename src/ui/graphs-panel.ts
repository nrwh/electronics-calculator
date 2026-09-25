// Graphs tab: each plot as an SVG figure with a data-table fallback.

import { PLOT_W } from '../plot/axes';
import { renderDataTable, renderPlot } from '../plot/render';
import type { PlotSpec } from '../plot/types';
import { h, replace } from './h';

/**
 * Plot width in SVG units. On narrow screens the viewBox matches the screen so tick labels stay
 * readable instead of being scaled down.
 */
function plotWidth(container: HTMLElement): number {
  const w = container.clientWidth || document.documentElement.clientWidth;
  return w < PLOT_W ? Math.max(340, Math.round(w)) : PLOT_W;
}

export function renderGraphs(container: HTMLElement, plots: PlotSpec[]): void {
  const width = plotWidth(container);
  replace(
    container,
    h('h2', { class: 'panel-title' }, 'Graphs'),
    h(
      'div',
      { class: 'plots' },
      plots.map((p, i) =>
        h(
          'figure',
          null,
          h('figcaption', null, p.title),
          h('div', { html: renderPlot(p, `plot-${i}`, width) }),
          h(
            'details',
            { class: 'data' },
            h('summary', null, 'Data table'),
            h('div', { html: renderDataTable(p) }),
          ),
        ),
      ),
    ),
  );
}
