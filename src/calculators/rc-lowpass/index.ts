import { c, type Complex } from '../../lib/complex';
import { deg, evaluate, logspace, linspace, sweepAround, toDb } from '../../lib/freq';
import { Netlist, pulse, spiceValue } from '../../lib/spice';
import { formatSI } from '../../lib/units';
import { kicad } from '../../schematic/kicad';
import sheet from './schematic.kicad_sch';
import { defineCalculator, ok, part, qty, type GuideItem, type ValuesOf } from '../types';

const vars = {
  fc: qty({
    label: 'Cut-off frequency',
    symbol: 'f_c',
    unit: 'Hz',
    default: '1k',
    help: 'Frequency where the output is 3 dB down.',
  }),
  R: part('R', { label: 'Resistor', symbol: 'R', default: '10k' }),
  C: part('C', { label: 'Capacitor', symbol: 'C', default: '10n' }),
  f: qty({
    label: 'Evaluate at',
    symbol: 'f',
    unit: 'Hz',
    default: '10k',
    help: 'Frequency for the attenuation and phase results.',
  }),
};

type V = ValuesOf<typeof vars>;

export interface Out {
  fc: number;
  tau: number;
  rise: number;
  magAtF: number;
  dbAtF: number;
  phaseAtF: number;
}

const TWO_PI = 2 * Math.PI;

export function transfer(R: number, C: number) {
  return (s: Complex): Complex => c(1).div(s.mul(R * C).add(1));
}

export default defineCalculator<typeof vars, Out>({
  vars,
  urlVersion: 1,
  solveFor: [
    { id: 'R', label: 'R', targets: ['R'] },
    { id: 'C', label: 'C', targets: ['C'] },
    { id: 'fc', label: 'f_c', targets: ['fc'] },
  ],
  solve: {
    R: ({ fc, C }) => ok({ R: 1 / (TWO_PI * fc * C) }),
    C: ({ fc, R }) => ok({ C: 1 / (TWO_PI * fc * R) }),
    fc: ({ R, C }) => ok({ fc: 1 / (TWO_PI * R * C) }),
  },
  analyse: (v) => {
    const fc = 1 / (TWO_PI * v.R * v.C);
    const tau = v.R * v.C;
    const x = v.f / fc;
    const magAtF = 1 / Math.sqrt(1 + x * x);
    return ok({
      out: { fc, tau, rise: tau * Math.log(9), magAtF, dbAtF: toDb(magAtF), phaseAtF: -deg(Math.atan(x)) },
      achieved: { fc },
    });
  },
  results: (v, o) => [
    { label: 'Cut-off frequency', symbol: 'f_c', value: o.fc, unit: 'Hz', headline: true, achieved: 'fc' },
    { label: 'Time constant', symbol: 'τ = RC', value: o.tau, unit: 's', headline: true },
    { label: 'Rise time, 10–90 %', symbol: 't_r = 2.2τ', value: o.rise, unit: 's' },
    {
      label: `Gain at ${formatSI(v.f, 'Hz')}`,
      value: o.magAtF,
      unit: 'V/V',
      group: 'At the evaluation frequency',
    },
    {
      label: `Attenuation at ${formatSI(v.f, 'Hz')}`,
      value: o.dbAtF,
      unit: 'dB',
      group: 'At the evaluation frequency',
    },
    {
      label: `Phase at ${formatSI(v.f, 'Hz')}`,
      value: o.phaseAtF,
      unit: '°',
      group: 'At the evaluation frequency',
    },
  ],
  schematic: (v) =>
    kicad(sheet, {
      title: 'RC low-pass filter schematic',
      desc: `Source V1 drives R1 (${formatSI(v.R, 'Ω')}) in series; C1 (${formatSI(v.C, 'F')}) goes from the output to ground.`,
      vars: { R: formatSI(v.R, 'Ω'), C: formatSI(v.C, 'F') },
    }),
  plots: (v, o) => {
    // Two decades either side of f_c, widened to include the evaluation frequency (up to 3 decades away).
    const fEval = Math.min(Math.max(v.f, o.fc / 1000), o.fc * 1000);
    const [lo] = sweepAround(Math.min(o.fc, fEval), 2, 0);
    const [, hi] = sweepAround(Math.max(o.fc, fEval), 0, 2);
    const f = logspace(lo, hi, 400);
    const r = evaluate(transfer(v.R, v.C), f);
    const t = linspace(0, 6 * o.tau, 300);
    return [
      {
        kind: 'bode',
        title: 'Frequency response',
        desc: `Magnitude and phase of Vout/Vin. The response is flat below ${formatSI(o.fc, 'Hz')}, 3 dB down at it, and falls at 20 dB per decade above it; the phase goes from 0° to −90°.`,
        f,
        series: [{ name: 'Vout/Vin', db: r.db, phase: r.phase }],
        markers: [
          { x: o.fc, label: `f_c ${formatSI(o.fc, 'Hz', 3)}` },
          ...(Math.abs(Math.log10(v.f / o.fc)) > 0.15
            ? [{ x: v.f, label: `f ${formatSI(v.f, 'Hz', 3)}` }]
            : []),
        ],
      },
      {
        kind: 'waveform',
        title: 'Step response',
        desc: `Output for a 1 V input step: it reaches 63 % after one time constant (${formatSI(o.tau, 's')}) and 90 % after ${formatSI(o.tau * Math.log(10), 's')}.`,
        x: t,
        xLabel: 'Time',
        xUnit: 's',
        panels: [
          {
            label: 'Voltage',
            unit: 'V',
            range: [0, 1.1],
            series: [
              { name: 'Vin', y: t.map(() => 1), dashed: true, color: 1 },
              { name: 'Vout', y: t.map((ti) => 1 - Math.exp(-ti / o.tau)), color: 0 },
            ],
            refs: [
              { y: 0.9, label: '90 %' },
              { y: 0.1, label: '10 %' },
            ],
          },
        ],
        markers: [{ x: o.tau, label: 'τ' }],
      },
    ];
  },
  guide: (v, _o, s) => guide(v, s.tol.C),
  spice: (v, o) => {
    const n = new Netlist('RC low-pass filter', 'rc-lowpass');
    n.comment(`f_c = ${formatSI(o.fc, 'Hz')}, tau = ${formatSI(o.tau, 's')}`);
    n.comment('AC analysis for the Bode plot; transient for the 1 V step response.');
    n.add('V1', ['in', '0'], 'DC 0 AC 1', pulse(0, 1, 0, o.tau / 1000, o.tau / 1000, 20 * o.tau, 40 * o.tau));
    n.add('R1', ['in', 'out'], v.R);
    n.add('C1', ['out', '0'], v.C);
    const [f1, f2] = sweepAround(o.fc, 3, 3);
    n.analysis(`.ac dec 100 ${spiceValue(f1)} ${spiceValue(f2)}`);
    n.analysis(`.tran ${spiceValue(o.tau / 200)} ${spiceValue(6 * o.tau)}`);
    return n;
  },
});

function guide(v: V, tolC: number): GuideItem[] {
  const items: GuideItem[] = [];
  items.push({
    status: 'info',
    title: 'Source impedance ≪ R',
    text: `The source's output impedance adds to R and lowers f_c. Keep it below R/100 (${formatSI(v.R / 100, 'Ω')}) for f_c within 1 %, or include it in R.`,
  });
  items.push({
    status: 'info',
    title: 'Load impedance ≥ 10·R',
    text: `A resistive load forms a divider with R. At 10·R (${formatSI(10 * v.R, 'Ω')}) the passband loss is 0.8 dB and f_c rises by 10 %; at 100·R (${formatSI(100 * v.R, 'Ω')}) both are under 1 %. Buffer the output if the load is lower.`,
  });
  if (v.R < 100) {
    items.push({
      status: 'warn',
      title: 'R is very low',
      text: `At ${formatSI(v.R, 'Ω')}, the source must supply up to ${formatSI(1 / v.R, 'A')} per volt of input step. Use a larger R and a smaller C.`,
    });
  } else if (v.R > 1e6) {
    items.push({
      status: 'warn',
      title: 'R is very high',
      text: `Above 1 MΩ, leakage, PCB contamination, input bias currents and thermal noise (${formatSI(Math.sqrt(4 * 1.380649e-23 * 300 * v.R), 'V')}/√Hz here) become significant. Use a smaller R and a larger C.`,
    });
  } else {
    items.push({
      status: 'ok',
      title: 'R is in a practical range',
      text: `${formatSI(v.R, 'Ω')} is between 100 Ω and 1 MΩ: easy to drive, with low noise and leakage error.`,
    });
  }
  if (v.C <= 100e-9) {
    items.push({
      status: 'ok',
      title: 'Capacitor: C0G (NP0) ceramic',
      text: `${formatSI(v.C, 'F')} is available in C0G, which is stable over temperature (±30 ppm/°C), does not lose capacitance with DC bias and has 1–5 % tolerance. Avoid X7R/X5R where f_c accuracy matters.`,
    });
  } else if (v.C <= 10e-6) {
    items.push({
      status: 'warn',
      title: 'Capacitor: film, or X7R with care',
      text: `C0G is rarely available at ${formatSI(v.C, 'F')}. Film (polypropylene or PET) keeps f_c accurate. X7R/X5R varies ±15 % over temperature and loses capacitance under DC bias (often 30–80 % at rated voltage), which raises f_c; check the manufacturer's DC-bias curve.`,
    });
  } else {
    items.push({
      status: 'warn',
      title: 'Capacitor: large value',
      text: `${formatSI(v.C, 'F')} usually means an electrolytic, with ±20 % tolerance, leakage and polarity to observe. Consider a larger R and a smaller C.`,
    });
  }
  items.push({
    status: 'info',
    title: 'Tolerance',
    text: `f_c depends on R·C, so their tolerances add: ±${tolC} % on C dominates unless R is worse. The spread next to f_c shows the worst case.`,
  });
  return items;
}
