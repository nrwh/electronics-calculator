// Bode plot: magnitude (dB) and optional phase (degrees) over a log frequency axis.

import { esc } from '../schematic/draw';
import type { BodePlot } from './types';
import {
  MARGIN,
  PLOT_W,
  drawFrame,
  legend,
  linePath,
  linear,
  log,
  logTicks,
  niceTicks,
  plainTick,
  rangeOf,
  siTick,
  svgOpen,
} from './axes';

function dbTicks(min: number, max: number): { ticks: number[]; min: number; max: number } {
  const span = max - min;
  const step = span > 120 ? 40 : span > 60 ? 20 : span > 24 ? 10 : span > 8 ? 5 : span > 3 ? 1 : 0.5;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v);
  return { ticks, min: lo, max: hi };
}

function phaseTicks(min: number, max: number): { ticks: number[]; min: number; max: number } {
  const span = max - min;
  const step = span > 360 ? 180 : span > 150 ? 90 : span > 40 ? 45 : 15;
  const lo = Math.floor(min / step - 1e-9) * step;
  const hi = Math.ceil(max / step + 1e-9) * step;
  if (hi - lo < step) return niceTicks(min, max);
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v);
  return { ticks, min: lo, max: hi };
}

export function renderBode(p: BodePlot, id: string, W = PLOT_W): string {
  const showPhase = p.showPhase !== false && p.series.some((s) => s.phase);
  const magH = showPhase ? 180 : 230;
  const phH = 120;
  const gap = 22;
  const top = MARGIN.top;
  const magBottom = top + magH;
  const phTop = magBottom + gap;
  const phBottom = phTop + phH;
  const H = (showPhase ? phBottom : magBottom) + MARGIN.bottom;
  const left = MARGIN.left;
  const right = W - MARGIN.right;
  const f0 = p.f[0]!;
  const f1 = p.f[p.f.length - 1]!;
  const x = log(f0, f1, left, right);
  const xt = logTicks(f0, f1);

  let [dbMin, dbMax] = p.dbRange ?? rangeOf(p.series.map((s) => s.db));
  if (!p.dbRange) {
    dbMin = Math.max(dbMin, dbMax - 120);
    const pad = Math.max(1, (dbMax - dbMin) * 0.05);
    dbMin -= pad;
    dbMax += pad;
  }
  const yt = dbTicks(dbMin, dbMax);
  const y = linear(yt.min, yt.max, magBottom, top);
  let out = svgOpen(W, H, p.title, p.desc, id);
  out += drawFrame(
    { x, y, top, bottom: magBottom, left, right },
    {
      xTicks: xt.major,
      xMinor: xt.minor,
      yTicks: yt.ticks,
      xFormat: (v) => siTick(v, 'Hz'),
      yFormat: plainTick,
      yTitle: `${p.magLabel ?? 'Magnitude'} (dB)`,
      showXLabels: !showPhase,
      xTitle: showPhase ? undefined : 'Frequency',
    },
  );
  const clip: [number, number] = [yt.min, yt.max];
  p.series.forEach((s, i) => {
    out += `<path class="series s${s.color ?? i}${s.dashed ? ' dashed' : ''}" d="${linePath(p.f, s.db, x, y, clip)}"/>`;
  });

  if (showPhase) {
    const phSeries = p.series.filter((s) => s.phase);
    const [pm, pM] = rangeOf(phSeries.map((s) => s.phase!));
    const pt = phaseTicks(pm, pM);
    const yp = linear(pt.min, pt.max, phBottom, phTop);
    out += drawFrame(
      { x, y: yp, top: phTop, bottom: phBottom, left, right },
      {
        xTicks: xt.major,
        xMinor: xt.minor,
        yTicks: pt.ticks,
        xFormat: (v) => siTick(v, 'Hz'),
        yFormat: (v) => `${plainTick(v)}°`,
        yTitle: 'Phase',
        showXLabels: true,
        xTitle: 'Frequency',
      },
    );
    p.series.forEach((s, i) => {
      if (s.phase)
        out += `<path class="series s${s.color ?? i}${s.dashed ? ' dashed' : ''}" d="${linePath(p.f, s.phase, x, yp)}"/>`;
    });
  }

  for (const m of p.markers ?? []) {
    if (!(m.x >= f0 && m.x <= f1)) continue;
    const mx = x(m.x);
    out += `<line class="marker" x1="${mx}" y1="${top}" x2="${mx}" y2="${showPhase ? phBottom : magBottom}"/>`;
    out += `<text class="marker-label" x="${mx + 4}" y="${top + 12}">${esc(m.label)}</text>`;
  }
  out += legend(
    p.series.map((s, i) => ({ name: s.name, color: s.color ?? i, dashed: s.dashed })),
    left,
    top - 10,
  );
  return out + '</svg>';
}
