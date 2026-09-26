// Render any PlotSpec to SVG markup, plus a data-table fallback for screen readers.

import { esc } from '../schematic/markup';
import { formatNum, formatSI } from '../lib/units';
import { sampleIndices } from './axes';
import { renderBode } from './bode';
import { renderTiming } from './timing';
import type { PlotSpec } from './types';
import { renderWaveform } from './waveform';

export function renderPlot(p: PlotSpec, id: string, width?: number): string {
  switch (p.kind) {
    case 'bode':
      return renderBode(p, id, width);
    case 'waveform':
      return renderWaveform(p, id, width);
    case 'timing':
      return renderTiming(p, id, width);
  }
}

function table(head: string[], rows: string[][]): string {
  return (
    `<table class="data-table"><thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>` +
    rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') +
    `</tbody></table>`
  );
}

/** A small table of sampled points so the plot's data is available without the picture. */
export function renderDataTable(p: PlotSpec): string {
  switch (p.kind) {
    case 'bode': {
      const idx = sampleIndices(p.f.length, 13);
      const head = ['Frequency'];
      for (const s of p.series) {
        head.push(`${s.name} (dB)`);
        if (s.phase && p.showPhase !== false) head.push(`${s.name} phase (°)`);
      }
      const rows = idx.map((i) => {
        const r = [formatSI(p.f[i]!, 'Hz', 3)];
        for (const s of p.series) {
          r.push(formatNum(s.db[i]!, 3));
          if (s.phase && p.showPhase !== false) r.push(formatNum(s.phase[i]!, 3));
        }
        return r;
      });
      return table(head, rows);
    }
    case 'waveform': {
      const idx = sampleIndices(p.x.length, 13);
      const head = [`${p.xLabel}`];
      for (const panel of p.panels) for (const s of panel.series) head.push(`${s.name} (${panel.unit})`);
      const rows = idx.map((i) => {
        const r = [formatSI(p.x[i]!, p.xUnit, 3)];
        for (const panel of p.panels) for (const s of panel.series) r.push(formatSI(s.y[i]!, '', 4));
        return r;
      });
      return table(head, rows);
    }
    case 'timing': {
      const steps = Math.max(...p.signals.map((s) => s.values.length));
      const head = ['Clock', ...(p.stepLabels ? ['State'] : []), ...p.signals.map((s) => s.name)];
      const rows = Array.from({ length: steps }, (_, i) => [
        String(i),
        ...(p.stepLabels ? [p.stepLabels[i] ?? ''] : []),
        ...p.signals.map((s) => String(s.values[i] ?? '')),
      ]);
      return table(head, rows);
    }
  }
}
