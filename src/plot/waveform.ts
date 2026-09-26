// Time-domain waveform plot: one or more stacked panels sharing a linear time axis.

import { esc } from '../schematic/markup';
import type { WaveformPlot } from './types';
import {
  MARGIN,
  PLOT_W,
  autoTickFormat,
  drawFrame,
  legend,
  linePath,
  linear,
  niceTicks,
  rangeOf,
  siTick,
  svgOpen,
} from './axes';

export function renderWaveform(p: WaveformPlot, id: string, W = PLOT_W): string {
  const panelH = p.panels.length > 1 ? 130 : 200;
  const gap = 24;
  const left = MARGIN.left;
  const right = W - MARGIN.right;
  const top0 = MARGIN.top;
  const H = top0 + p.panels.length * panelH + (p.panels.length - 1) * gap + MARGIN.bottom;
  const x0 = p.x[0]!;
  const x1 = p.x[p.x.length - 1]!;
  const xt = niceTicks(x0, x1, 6);
  const x = linear(x0, x1, left, right);
  const xTicks = xt.ticks.filter((v) => v >= x0 - 1e-15 && v <= x1 + 1e-15);
  let out = svgOpen(W, H, p.title, p.desc, id);
  const legendItems: { name: string; color: number; dashed?: boolean }[] = [];
  let colour = 0;

  p.panels.forEach((panel, pi) => {
    const top = top0 + pi * (panelH + gap);
    const bottom = top + panelH;
    let [lo, hi] =
      panel.range ?? rangeOf([...panel.series.map((s) => s.y), ...(panel.refs ?? []).map((r) => [r.y])]);
    if (!panel.range) {
      const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.1 || 1;
      lo -= pad;
      hi += pad;
    }
    const yt = niceTicks(lo, hi, 4);
    const y = linear(yt.min, yt.max, bottom, top);
    const last = pi === p.panels.length - 1;
    out += drawFrame(
      { x, y, top, bottom, left, right },
      {
        xTicks,
        yTicks: yt.ticks,
        xFormat: (v) => siTick(v, p.xUnit),
        yFormat: autoTickFormat(yt.ticks),
        yTitle: `${panel.label} (${panel.unit})`,
        showXLabels: last,
        xTitle: last ? p.xLabel : undefined,
      },
    );
    for (const r of panel.refs ?? []) {
      const ry = y(r.y);
      out += `<line class="marker" x1="${left}" y1="${ry}" x2="${right}" y2="${ry}"/>`;
      out += `<text class="marker-label" x="${right - 4}" y="${ry - 4}" text-anchor="end">${esc(r.label)}</text>`;
    }
    for (const s of panel.series) {
      const c = s.color ?? colour++ % 4;
      out += `<path class="series s${c}${s.dashed ? ' dashed' : ''}" d="${linePath(p.x, s.y, x, y, [yt.min, yt.max])}"/>`;
      legendItems.push({ name: s.name, color: c, dashed: s.dashed });
    }
  });

  const bottomAll = H - MARGIN.bottom;
  for (const m of p.markers ?? []) {
    if (!(m.x >= x0 && m.x <= x1)) continue;
    const mx = x(m.x);
    out += `<line class="marker" x1="${mx}" y1="${top0}" x2="${mx}" y2="${bottomAll}"/>`;
    out += `<text class="marker-label" x="${mx + 4}" y="${top0 + 12}">${esc(m.label)}</text>`;
  }
  out += legend(legendItems, left, top0 - 10);
  return out + '</svg>';
}
