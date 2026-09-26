// Digital timing diagram: a clock row and one row per signal, one step per clock period.

import { esc } from '../schematic/markup';
import type { TimingPlot } from './types';
import { PLOT_W, siTick, svgOpen } from './axes';

export function renderTiming(p: TimingPlot, id: string, W = PLOT_W): string {
  const rowH = 30;
  const high = 8;
  const low = 24;
  const left = 64;
  const right = W - 12;
  const top = 12;
  const steps = Math.max(1, ...p.signals.map((s) => s.values.length));
  const dx = (right - left) / steps;
  const rows = (p.clock ? 1 : 0) + p.signals.length;
  const labelRow = p.stepLabels ? 18 : 0;
  const H = top + rows * rowH + labelRow + 30;
  let out = svgOpen(W, H, p.title, p.desc, id);
  let r = 0;

  for (let i = 0; i <= steps; i++) {
    const gx = left + i * dx;
    out += `<line class="grid minor" x1="${gx}" y1="${top}" x2="${gx}" y2="${top + rows * rowH}"/>`;
  }

  const rowY = (row: number): number => top + row * rowH;
  if (p.clock) {
    const y0 = rowY(r);
    let d = `M${left} ${y0 + low}`;
    for (let i = 0; i < steps; i++) {
      const x0 = left + i * dx;
      d += ` L${x0} ${y0 + high} L${x0 + dx / 2} ${y0 + high} L${x0 + dx / 2} ${y0 + low} L${x0 + dx} ${y0 + low}`;
    }
    out += `<text class="tick" x="${left - 8}" y="${y0 + 20}" text-anchor="end">CLK</text>`;
    out += `<path class="series s3" d="${d}"/>`;
    r++;
  }
  p.signals.forEach((s, si) => {
    const y0 = rowY(r);
    const lvl = (v: number): number => y0 + (v ? high : low);
    let d = `M${left} ${lvl(s.values[0] ?? 0)}`;
    s.values.forEach((v, i) => {
      const x0 = left + i * dx;
      if (i > 0 && v !== s.values[i - 1]) d += ` L${x0} ${lvl(v)}`;
      d += ` L${x0 + dx} ${lvl(v)}`;
    });
    out += `<text class="tick" x="${left - 8}" y="${y0 + 20}" text-anchor="end">${esc(s.name)}</text>`;
    out += `<path class="series s${si % 3}" d="${d}"/>`;
    r++;
  });
  const yb = top + rows * rowH;
  if (p.stepLabels) {
    p.stepLabels.forEach((l, i) => {
      out += `<text class="tick" x="${left + (i + 0.5) * dx}" y="${yb + 13}" text-anchor="middle">${esc(l)}</text>`;
    });
  }
  const every = Math.ceil(steps / 8);
  for (let i = 0; i <= steps; i += every) {
    out += `<text class="tick" x="${left + i * dx}" y="${yb + labelRow + 16}" text-anchor="middle">${esc(siTick(i * p.period, 's'))}</text>`;
  }
  return out + '</svg>';
}
