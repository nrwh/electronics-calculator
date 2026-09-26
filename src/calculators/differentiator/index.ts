// Practical differentiator: R1 in series with C at the input, Cf across Rf in the feedback.
// H(s) = −sRfC / ((1 + sR1C)(1 + sRfCf))

import { type Complex, c, jw, parallel } from '../../lib/complex';
import { deg, findCrossing, linspace, logspace, toDb, unwrap } from '../../lib/freq';
import { DEFAULT_A0, OPAMP_SUBCKT, type OpAmp, openLoop, opampSubckt } from '../../lib/opamp';
import { bisect } from '../../lib/solve';
import { Netlist, sine, spiceValue } from '../../lib/spice';
import { formatSI, formatSlew } from '../../lib/units';
import { kicad } from '../../schematic/kicad';
import sheet from './schematic.kicad_sch';
import { type GuideItem, type ValuesOf, type Warning, defineCalculator, fail, ok, part, qty } from '../types';

const vars = {
  fa: qty({
    label: 'Unity-gain frequency',
    symbol: 'f_a',
    unit: 'Hz',
    default: '1k',
    help: 'Frequency where the differentiator gain crosses 0 dB (1 V/V).',
  }),
  fb: qty({
    label: 'Upper corner',
    symbol: 'f_b',
    unit: 'Hz',
    default: '20k',
    help: 'Top of the differentiated band; above it the gain rolls off.',
  }),
  C: part('C', { label: 'Input capacitor', symbol: 'C', default: '10n' }),
  Rf: part('R', { label: 'Feedback resistor', symbol: 'R_f', default: '10k' }),
  R1: part('R', { label: 'Input resistor', symbol: 'R_1', default: '470' }),
  Cf: part('C', { label: 'Feedback capacitor', symbol: 'C_f', default: '470p' }),
  gbw: qty({
    label: 'Op-amp GBW',
    symbol: 'GBW',
    unit: 'Hz',
    default: '3M',
    help: 'Gain-bandwidth product.',
  }),
  vsat: qty({
    label: 'Output swing',
    symbol: '±V_sat',
    unit: 'V',
    default: '12',
    help: 'Output voltage limit (±).',
  }),
  vin: qty({
    label: 'Input amplitude',
    symbol: 'V_in',
    unit: 'V',
    default: '1',
    help: 'Peak input amplitude.',
  }),
  fin: qty({ label: 'Input frequency', symbol: 'f_in', unit: 'Hz', default: '500' }),
};

type V = ValuesOf<typeof vars>;
type Key = keyof typeof vars;

export interface Out {
  fa: number;
  fb: number;
  /** Input pole 1/(2πR1C) and feedback pole 1/(2πRfCf). */
  p1: number;
  p2: number;
  /** Uncompensated noise gain meets the open-loop gain here: √(fa·GBW). */
  fi: number;
  /** Loop-gain crossover and phase margin. */
  fx: number;
  pm: number;
  /** Minimum GBW for 60° phase margin. */
  gbwMin: number;
  /** Peak noise gain and where it occurs (near f_b). */
  ngPeak: number;
  ngPeakF: number;
  peakDb: number;
  peakF: number;
  gainIn: number;
  phaseIn: number;
  voutPk: number;
  slew: number;
  gainFaDb: number;
  gainFbDb: number;
}

const TWO_PI = 2 * Math.PI;

interface Parts {
  Rf: number;
  R1: number;
  Cf: number;
  C: number;
}

const zf = (p: Parts, s: Complex): Complex => parallel(c(p.Rf), s.mul(p.Cf).inv());
const zin = (p: Parts, s: Complex): Complex => s.mul(p.C).inv().add(p.R1);

/** Ideal (infinite-gain) transfer function −Zf/Zin. */
export function idealH(p: Parts, s: Complex): Complex {
  return zf(p, s).div(zin(p, s)).neg();
}

/** Noise gain 1/β = 1 + Zf/Zin. */
export function noiseGain(p: Parts, s: Complex): Complex {
  return zf(p, s).div(zin(p, s)).add(1);
}

/** Closed-loop response with a single-pole op-amp: −(Zf/Zin) / (1 + NG/A). */
export function closedLoop(p: Parts, op: OpAmp, s: Complex): Complex {
  return idealH(p, s).div(noiseGain(p, s).div(openLoop(op, s)).add(1));
}

const opOf = (v: { gbw: number; vsat: number }): OpAmp => ({
  a0: DEFAULT_A0,
  gbw: v.gbw,
  vmax: v.vsat,
  vmin: -v.vsat,
});

/** Loop-gain crossover frequency and phase margin (degrees). */
export function phaseMargin(p: Parts, op: OpAmp): { fx: number; pm: number } {
  const loop = (f: number): Complex => openLoop(op, jw(f)).div(noiseGain(p, jw(f)));
  const lo = Math.min(1 / (TWO_PI * p.Rf * p.C), op.gbw / op.a0) / 10;
  const fx = findCrossing((f) => Math.log10(loop(f).abs()), lo, op.gbw * 100, 600);
  if (!Number.isFinite(fx)) return { fx: NaN, pm: NaN };
  return { fx, pm: 180 + deg(loop(fx).arg()) };
}

function frequencies(p: Parts): { fa: number; fb: number; p1: number; p2: number } {
  const fa = 1 / (TWO_PI * p.Rf * p.C);
  const p1 = 1 / (TWO_PI * p.R1 * p.C);
  const p2 = 1 / (TWO_PI * p.Rf * p.Cf);
  // With RfCf = R1C the two poles coincide at fb; otherwise fb is their geometric mean.
  return { fa, fb: Math.sqrt(p1 * p2), p1, p2 };
}

export default defineCalculator<typeof vars, Out>({
  vars,
  urlVersion: 1,
  solveFor: [
    { id: 'parts', label: 'R_f, R_1, C_f', targets: ['Rf', 'R1', 'Cf'] },
    { id: 'freqs', label: 'f_a, f_b', targets: ['fa', 'fb'] },
  ],
  solve: {
    parts: ({ fa, fb, C }) => {
      if (fb <= fa) return fail<Key>('fb', 'Must be above f_a');
      const Rf = 1 / (TWO_PI * fa * C);
      const R1 = 1 / (TWO_PI * fb * C);
      return ok({ Rf, R1, Cf: (R1 * C) / Rf });
    },
    freqs: ({ Rf, R1, Cf, C }) => {
      const { fa, fb } = frequencies({ Rf, R1, Cf, C });
      return ok({ fa, fb });
    },
  },
  analyse: (v) => {
    const p: Parts = v;
    const op = opOf(v);
    const { fa, fb, p1, p2 } = frequencies(p);
    if (fb <= fa) {
      return fail<Key>(
        null,
        `f_b (${formatSI(fb, 'Hz')}) must be above f_a (${formatSI(fa, 'Hz')}); make R_1 smaller or R_f larger.`,
      );
    }
    const warnings: Warning<Key>[] = [];
    const sep = Math.max(p1 / p2, p2 / p1);
    if (sep > 1.5) {
      warnings.push({
        field: null,
        message: `The two poles have separated (R_1C and R_fC_f differ by ${sep.toFixed(2)}×): ${formatSI(p1, 'Hz')} and ${formatSI(p2, 'Hz')}. Choose C_f ≈ R_1C/R_f.`,
      });
    }
    const fi = Math.sqrt(fa * v.gbw);
    if (fb > fi / 2) {
      warnings.push({
        field: 'fb',
        message: `f_b is not well below √(f_a·GBW) = ${formatSI(fi, 'Hz')}, where the uncompensated noise gain meets the op-amp gain.`,
      });
    }
    const { fx, pm } = phaseMargin(p, op);
    if (pm < 45)
      warnings.push({
        field: 'gbw',
        message: `Phase margin is only ${pm.toFixed(0)}°; expect ringing. Use a faster op-amp or lower f_b.`,
      });
    const pmAt = (gbw: number): number => phaseMargin(p, { ...op, gbw }).pm - 60;
    const gbwMin = pmAt(1e12) < 0 ? NaN : pmAt(fb) > 0 ? fb : bisect(pmAt, fb, 1e12, { tol: 1e-4 });

    // Peaks of the closed-loop response and of the noise gain.
    let peakDb = -Infinity;
    let peakF = fb;
    let ngPeak = 0;
    let ngPeakF = fb;
    for (const f of logspace(fa / 10, Math.max(v.gbw, fb * 100), 400)) {
      const g = toDb(closedLoop(p, op, jw(f)).abs());
      if (g > peakDb) {
        peakDb = g;
        peakF = f;
      }
      const ng = noiseGain(p, jw(f)).abs();
      if (ng > ngPeak) {
        ngPeak = ng;
        ngPeakF = f;
      }
    }
    const hIn = closedLoop(p, op, jw(v.fin));
    const voutPk = hIn.abs() * v.vin;
    if (voutPk > v.vsat) {
      warnings.push({
        field: 'vin',
        message: `The output would be ${formatSI(voutPk, 'V')} peak, beyond the ±${formatSI(v.vsat, 'V')} swing: it will clip.`,
      });
    }
    return ok(
      {
        out: {
          fa,
          fb,
          p1,
          p2,
          fi,
          fx,
          pm,
          gbwMin,
          ngPeak,
          ngPeakF,
          peakDb,
          peakF,
          gainIn: hIn.abs(),
          phaseIn: deg(hIn.arg()),
          voutPk,
          slew: TWO_PI * v.fin * Math.min(voutPk, v.vsat),
          gainFaDb: toDb(closedLoop(p, op, jw(fa)).abs()),
          gainFbDb: toDb(closedLoop(p, op, jw(fb)).abs()),
        },
        achieved: { fa, fb },
      },
      warnings,
    );
  },
  results: (v, o) => [
    { label: 'Unity-gain frequency', symbol: 'f_a', value: o.fa, unit: 'Hz', headline: true, achieved: 'fa' },
    { label: 'Upper corner', symbol: 'f_b', value: o.fb, unit: 'Hz', headline: true, achieved: 'fb' },
    {
      label: 'Phase margin',
      value: o.pm,
      unit: '°',
      sig: 3,
      headline: true,
      status: o.pm < 45 ? 'warn' : 'ok',
      note: `loop crossover at ${formatSI(o.fx, 'Hz')}`,
    },
    { label: 'Input pole', symbol: '1/(2πR_1C)', value: o.p1, unit: 'Hz', group: 'Response' },
    { label: 'Feedback pole', symbol: '1/(2πR_fC_f)', value: o.p2, unit: 'Hz', group: 'Response' },
    {
      label: 'Peak gain',
      value: o.peakDb,
      unit: 'dB',
      sig: 3,
      note: `at ${formatSI(o.peakF, 'Hz')}`,
      group: 'Response',
    },
    {
      label: 'Peak noise gain',
      symbol: '1/β',
      value: o.ngPeak,
      unit: 'V/V',
      sig: 3,
      group: 'Stability',
      note: `at ${formatSI(o.ngPeakF, 'Hz')}`,
    },
    {
      label: 'Uncompensated intersection',
      symbol: '√(f_a·GBW)',
      value: o.fi,
      unit: 'Hz',
      group: 'Stability',
      note: 'f_b should be well below this',
    },
    { label: 'Minimum GBW for 60° margin', value: o.gbwMin, unit: 'Hz', group: 'Stability' },
    {
      label: `Gain at ${formatSI(v.fin, 'Hz')}`,
      value: o.gainIn,
      unit: 'V/V',
      group: 'At the input frequency',
    },
    {
      label: 'Output amplitude',
      value: o.voutPk,
      unit: 'V',
      group: 'At the input frequency',
      status: o.voutPk > v.vsat ? 'warn' : undefined,
    },
    { label: 'Phase', value: o.phaseIn, unit: '°', sig: 3, group: 'At the input frequency' },
    {
      label: 'Required slew rate',
      symbol: '2πf·V_pk',
      value: o.slew / 1e6,
      unit: 'V/µs',
      sig: 3,
      group: 'At the input frequency',
    },
  ],
  schematic: (v) =>
    kicad(sheet, {
      title: 'Differentiator schematic',
      desc: `The input passes through C (${formatSI(v.C, 'F')}) and R1 (${formatSI(v.R1, 'Ω')}) to the inverting input. Rf (${formatSI(v.Rf, 'Ω')}) and Cf (${formatSI(v.Cf, 'F')}) are in parallel from the inverting input to the output. The non-inverting input is grounded.`,
      vars: {
        C: formatSI(v.C, 'F'),
        R1: formatSI(v.R1, 'Ω'),
        GBW: formatSI(v.gbw, 'Hz'),
        CF: formatSI(v.Cf, 'F'),
        RF: formatSI(v.Rf, 'Ω'),
      },
    }),
  plots: (v, o) => {
    const p: Parts = v;
    const op = opOf(v);
    const f = logspace(
      10 ** Math.floor(Math.log10(Math.min(o.fa, v.fin)) - 1),
      10 ** Math.ceil(Math.log10(v.gbw * 3)),
      400,
    );
    const cl = f.map((x) => closedLoop(p, op, jw(x)));
    const id = f.map((x) => idealH(p, jw(x)));
    const t = linspace(0, 2 / v.fin, 400);
    const hIn = closedLoop(p, op, jw(v.fin));
    const w = TWO_PI * v.fin;
    return [
      {
        kind: 'bode',
        title: 'Closed-loop response and stability',
        desc: `Closed-loop gain rises at 20 dB per decade from ${formatSI(o.fa, 'Hz')} (0 dB) to about ${formatSI(o.fb, 'Hz')}, then rolls off. The op-amp open-loop gain and the noise gain are overlaid: they meet at ${formatSI(o.fx, 'Hz')} with a phase margin of ${o.pm.toFixed(0)}°.`,
        f,
        series: [
          {
            name: 'Closed loop',
            db: cl.map((h) => toDb(h.abs())),
            phase: unwrap(cl.map((h) => deg(h.arg()))),
            color: 0,
          },
          { name: 'Ideal op-amp', db: id.map((h) => toDb(h.abs())), dashed: true, color: 1 },
          {
            name: 'Op-amp gain A',
            db: f.map((x) => toDb(openLoop(op, jw(x)).abs())),
            dashed: true,
            color: 3,
          },
          {
            name: 'Noise gain 1/β',
            db: f.map((x) => toDb(noiseGain(p, jw(x)).abs())),
            dashed: true,
            color: 2,
          },
        ],
        markers: [
          { x: o.fa, label: 'f_a' },
          { x: o.fb, label: 'f_b' },
          { x: o.fx, label: 'crossover' },
        ],
      },
      {
        kind: 'waveform',
        title: `Input and output at ${formatSI(v.fin, 'Hz')}`,
        desc: `Steady-state response to a ${formatSI(v.vin, 'V')} peak sine: the output is ${formatSI(o.voutPk, 'V')} peak with a phase of ${o.phaseIn.toFixed(0)}° relative to the input (an inverting differentiator gives −90° in the passband).`,
        x: t,
        xLabel: 'Time',
        xUnit: 's',
        panels: [
          {
            label: 'Voltage',
            unit: 'V',
            series: [
              { name: 'Vin', y: t.map((x) => v.vin * Math.sin(w * x)), color: 1, dashed: true },
              {
                name: 'Vout',
                y: t.map((x) =>
                  Math.max(-v.vsat, Math.min(v.vsat, hIn.abs() * v.vin * Math.sin(w * x + hIn.arg()))),
                ),
                color: 0,
              },
            ],
          },
        ],
      },
    ];
  },
  guide: (v, o) => guide(v, o),
  spice: (v, o) => {
    const op = opOf(v);
    const n = new Netlist('Analog differentiator', 'differentiator');
    n.comment(
      `f_a = ${formatSI(o.fa, 'Hz')}, f_b = ${formatSI(o.fb, 'Hz')}, phase margin ${o.pm.toFixed(0)} deg`,
    );
    n.comment('AC analysis for the Bode plot; transient for the sine response.');
    n.add('Vin', ['in', '0'], 'DC 0 AC 1', sine(0, v.vin, v.fin));
    n.add('C1', ['in', 'n1'], v.C);
    n.add('R1', ['n1', 'inv'], v.R1);
    n.add('Rf', ['inv', 'out'], v.Rf);
    n.add('Cf', ['inv', 'out'], v.Cf);
    n.raw(`XU1 0 inv out ${OPAMP_SUBCKT}`);
    n.subckt(opampSubckt(op));
    const f1 = 10 ** Math.floor(Math.log10(Math.min(o.fa, v.fin)) - 1);
    const f2 = 10 ** Math.ceil(Math.log10(v.gbw * 3));
    n.analysis(`.ac dec 100 ${spiceValue(f1)} ${spiceValue(f2)}`);
    n.analysis(`.tran ${spiceValue(1 / v.fin / 400)} ${spiceValue(5 / v.fin)}`);
    return n;
  },
});

function guide(v: V, o: Out): GuideItem[] {
  const items: GuideItem[] = [];
  items.push({
    status: Number.isFinite(o.gbwMin) && v.gbw >= o.gbwMin ? 'ok' : 'warn',
    title: `Op-amp GBW ≥ ${formatSI(o.gbwMin, 'Hz')}`,
    text: `That gives at least 60° phase margin with these parts. The chosen ${formatSI(v.gbw, 'Hz')} gives ${o.pm.toFixed(0)}°. A differentiator's noise gain rises with frequency, so it needs more bandwidth than an amplifier with the same passband gain.`,
  });
  items.push({
    status: 'info',
    title: `Slew rate ≥ ${formatSlew(o.slew)}`,
    text: `A sine of ${formatSI(Math.min(o.voutPk, v.vsat), 'V')} peak at ${formatSI(v.fin, 'Hz')} needs 2π·f·V_pk. Allow a factor of 2 or more, and more for fast edges: a step input drives the output at up to V_step/(R_1C_f).`,
  });
  items.push({
    status: o.voutPk > v.vsat ? 'warn' : 'ok',
    title: 'Output swing',
    text: `The output is ${formatSI(o.voutPk, 'V')} peak against ±${formatSI(v.vsat, 'V')} available. Remember that the gain rises with frequency: higher-frequency inputs of the same amplitude give larger outputs, up to about f_b.`,
  });
  items.push({
    status: v.Rf > 100e3 ? 'warn' : 'info',
    title: 'Input bias current',
    text: `The bias current of the inverting input flows through R_f and appears as an output offset I_b·R_f: ${formatSI(100e-9 * v.Rf, 'V')} for a bipolar op-amp with 100 nA. ${v.Rf > 100e3 ? 'With R_f above 100 kΩ, use a JFET or CMOS input op-amp.' : 'A JFET or CMOS input op-amp makes this negligible.'}`,
  });
  items.push({
    status: 'info',
    title: 'Noise',
    text: `The noise gain peaks at ${o.ngPeak.toFixed(1)} near ${formatSI(o.ngPeakF, 'Hz')}, so the op-amp's voltage noise is amplified by up to that factor around f_b. Keep f_b no higher than the signal needs, and choose a low-noise op-amp if the output is small.`,
  });
  items.push({
    status: 'info',
    title: 'Source impedance',
    text: `At high frequency the input impedance falls to R_1 = ${formatSI(v.R1, 'Ω')}. The source must drive that; its own output impedance adds to R_1 and lowers f_b.`,
  });
  items.push({
    status: 'info',
    title: 'Capacitors',
    text: `Use C0G/NP0 ceramic or film for C and C_f so that f_a and f_b don't move with temperature or bias. C_f (${formatSI(v.Cf, 'F')}) is small, so allow for a few pF of layout capacitance across R_f.`,
  });
  return items;
}
