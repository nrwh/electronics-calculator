// Buck (step-down) converter in continuous conduction: duty cycle, inductor and output capacitor
// sizing, currents, input capacitor, feedback divider and an open-loop SPICE power stage.

import { type Complex, c, jw, parallel } from '../../lib/complex';
import { bestRatio } from '../../lib/eseries';
import { deg, logspace, toDb, unwrap } from '../../lib/freq';
import { bisect } from '../../lib/solve';
import { Netlist, pulse, spiceValue } from '../../lib/spice';
import { formatNum, formatSI } from '../../lib/units';
import { kicad } from '../../schematic/kicad';
import sheetAsync from './schematic-async.kicad_sch';
import sheetSync from './schematic-sync.kicad_sch';
import {
  type GuideItem,
  type Settings,
  type ValuesOf,
  type Warning,
  choice,
  defineCalculator,
  fail,
  fails,
  ok,
  part,
  qty,
} from '../types';

const vars = {
  topology: choice({
    label: 'Rectifier',
    options: [
      { value: 'sync', label: 'Synchronous (MOSFET)' },
      { value: 'async', label: 'Asynchronous (diode)' },
    ],
    default: 'sync',
  }),
  vinMin: qty({ label: 'Input voltage, min', symbol: 'V_{in,min}', unit: 'V', default: '10' }),
  vinMax: qty({ label: 'Input voltage, max', symbol: 'V_{in,max}', unit: 'V', default: '14' }),
  vout: qty({ label: 'Output voltage', symbol: 'V_out', unit: 'V', default: '5' }),
  iout: qty({ label: 'Output current', symbol: 'I_out', unit: 'A', default: '2' }),
  fsw: qty({ label: 'Switching frequency', symbol: 'f_sw', unit: 'Hz', default: '500k' }),
  eta: qty({
    label: 'Efficiency estimate',
    symbol: 'η',
    unit: '%',
    default: '90',
    min: 50,
    max: 100,
    help: 'Used for the synchronous duty cycle and the input current.',
  }),
  vf: qty({
    label: 'Diode forward voltage',
    symbol: 'V_F',
    unit: 'V',
    default: '0.45',
    max: 2,
    showIf: { key: 'topology', values: ['async'] },
  }),
  vref: qty({
    label: 'Feedback reference',
    symbol: 'V_ref',
    unit: 'V',
    default: '0.8',
    help: "The controller's feedback voltage.",
  }),
  esr: qty({
    label: 'Output capacitor ESR',
    symbol: 'ESR',
    unit: 'Ω',
    default: '5m',
    positive: false,
    min: 0,
  }),
  rippleI: qty({
    label: 'Inductor ripple',
    symbol: 'ΔI_L',
    unit: '%',
    default: '30',
    min: 1,
    max: 200,
    help: 'Peak-to-peak inductor ripple current as a percentage of I_out, at V_in,max.',
  }),
  rippleV: qty({
    label: 'Output ripple',
    symbol: 'ΔV_out',
    unit: 'V',
    default: '20m',
    help: 'Peak-to-peak output voltage ripple, at V_in,max.',
  }),
  L: part('L', { label: 'Inductor', symbol: 'L', default: '10u' }),
  Cout: part('C', { label: 'Output capacitor', symbol: 'C_out', default: '22u' }),
};

type V = ValuesOf<typeof vars>;
type Key = keyof typeof vars;

export interface Out {
  /** Duty cycle at V_in,max (smallest) and V_in,min (largest). */
  dMin: number;
  dMax: number;
  /** Inductor ripple (peak to peak) at V_in,max. */
  dI: number;
  ipk: number;
  ivalley: number;
  irms: number;
  /** Output ripple: total (from the waveform), and its capacitive and ESR components. */
  dV: number;
  dVcap: number;
  dVesr: number;
  icoutRms: number;
  cinMin: number;
  icinRms: number;
  iinAvg: number;
  pout: number;
  ploss: number;
  /** Load current below which an asynchronous converter enters discontinuous conduction. */
  iCrit: number;
  rTop: number;
  rBot: number;
  voutSet: number;
  iDivider: number;
  fLC: number;
  fEsr: number;
  /** Output ripple waveform over one period at V_in,max (zero mean), and the cap voltage at t = 0. */
  vc0: number;
}

type Topology = V['topology'];

/** Duty cycle: asynchronous (V_out + V_F)/(V_in + V_F); synchronous V_out/(η·V_in). */
export function duty(topology: Topology, vin: number, vout: number, vf: number, eta: number): number {
  return topology === 'async' ? (vout + vf) / (vin + vf) : vout / (eta * vin);
}

/**
 * Voltage across the inductor while the switch is off. With the lumped-loss model the
 * synchronous converter behaves as if V_out/η appears across the inductor.
 */
export function offVoltage(topology: Topology, vout: number, vf: number, eta: number): number {
  return topology === 'async' ? vout + vf : vout / eta;
}

/** Peak-to-peak inductor ripple. */
export function inductorRipple(vOff: number, d: number, fsw: number, L: number): number {
  return (vOff * (1 - d)) / (fsw * L);
}

/**
 * Output ripple waveform over one period for a triangular inductor current (CCM), a capacitor C
 * and series ESR: v = ESR·i_C + (1/C)∫i_C dt. Returns the zero-mean output ripple and the
 * capacitor's own ripple at t = 0 (start of the on-time).
 */
export function rippleWave(dI: number, d: number, fsw: number, C: number, esr: number, n = 400) {
  const T = 1 / fsw;
  const t: number[] = [];
  const iC: number[] = [];
  for (let k = 0; k <= n; k++) {
    const tk = (k / n) * T;
    t.push(tk);
    const x = tk / T;
    iC.push(x <= d ? -dI / 2 + (dI * x) / d : dI / 2 - (dI * (x - d)) / (1 - d));
  }
  // Integrate i_C (trapezoid) for the capacitor voltage.
  const vc = [0];
  for (let k = 1; k <= n; k++) vc.push(vc[k - 1]! + (((iC[k]! + iC[k - 1]!) / 2) * (t[k]! - t[k - 1]!)) / C);
  const out = vc.map((v, k) => v + esr * iC[k]!);
  const mean = out.slice(0, n).reduce((a, b) => a + b, 0) / n;
  return { t, iC, vout: out.map((v) => v - mean), vc0: vc[0]! - mean };
}

export function outputRipple(dI: number, d: number, fsw: number, C: number, esr: number): number {
  const w = rippleWave(dI, d, fsw, C, esr).vout;
  return Math.max(...w) - Math.min(...w);
}

/** Output capacitance that gives a peak-to-peak ripple of target (NaN if ESR alone exceeds it). */
export function capacitanceFor(target: number, dI: number, d: number, fsw: number, esr: number): number {
  if (esr * dI >= target) return NaN;
  return bisect((C) => outputRipple(dI, d, fsw, C, esr) - target, 1e-12, 100, { tol: 1e-11 });
}

/** Output filter (L, C with ESR, resistive load) transfer function V_out/V_sw. */
export function outputFilter(L: number, C: number, esr: number, rLoad: number, s: Complex): Complex {
  const zc = s.mul(C).inv().add(esr);
  const zLoad = parallel(zc, c(rLoad));
  return zLoad.div(s.mul(L).add(zLoad));
}

/**
 * Switching periods to simulate: at least 120, and at least 8 periods of the LC resonance so that
 * any residual ringing from the initial conditions has died away before the measurement window
 * (the last 20 periods).
 */
export function simCycles(fsw: number, fLC: number): number {
  return Math.max(120, Math.ceil((8 * fsw) / fLC));
}

function checkInputs(v: V) {
  const errors: { field: Key | null; message: string }[] = [];
  if (v.vinMax < v.vinMin) errors.push({ field: 'vinMax', message: 'Must be at least V_in,min' });
  if (v.vout >= v.vinMin)
    errors.push({ field: 'vout', message: 'Must be below V_in,min: a buck only steps down' });
  if (v.vref >= v.vout) errors.push({ field: 'vref', message: 'Must be below V_out' });
  const dMax = duty(v.topology, v.vinMin, v.vout, v.vf, v.eta / 100);
  if (!errors.length && dMax >= 1) {
    errors.push({
      field: 'eta',
      message: 'The duty cycle at V_in,min would reach 100 %; lower V_out or raise the efficiency',
    });
  }
  return errors;
}

export default defineCalculator<typeof vars, Out>({
  vars,
  urlVersion: 1,
  extraSeries: ['R'],
  solveFor: [
    { id: 'LC', label: 'L and C_out', targets: ['L', 'Cout'] },
    { id: 'ripple', label: 'Ripple', targets: ['rippleI', 'rippleV'] },
  ],
  solve: {
    LC: (v) => {
      const errors = checkInputs(v);
      if (errors.length) return fails(errors);
      const eta = v.eta / 100;
      const d = duty(v.topology, v.vinMax, v.vout, v.vf, eta);
      const dI = (v.rippleI / 100) * v.iout;
      const L = (offVoltage(v.topology, v.vout, v.vf, eta) * (1 - d)) / (v.fsw * dI);
      const Cout = capacitanceFor(v.rippleV, dI, d, v.fsw, v.esr);
      if (!Number.isFinite(Cout)) {
        return fail<Key>(
          'rippleV',
          `The ESR alone gives ${formatSI(v.esr * dI, 'V')} of ripple; the ESR must be below ${formatSI(v.rippleV / dI, 'Ω')}`,
        );
      }
      return ok({ L, Cout });
    },
    ripple: (v) => {
      const errors = checkInputs(v);
      if (errors.length) return fails(errors);
      const eta = v.eta / 100;
      const d = duty(v.topology, v.vinMax, v.vout, v.vf, eta);
      const dI = inductorRipple(offVoltage(v.topology, v.vout, v.vf, eta), d, v.fsw, v.L);
      return ok({ rippleI: (100 * dI) / v.iout, rippleV: outputRipple(dI, d, v.fsw, v.Cout, v.esr) });
    },
  },
  analyse: (v, s) => {
    const errors = checkInputs(v);
    if (errors.length) return fails(errors);
    const eta = v.eta / 100;
    const dMin = duty(v.topology, v.vinMax, v.vout, v.vf, eta);
    const dMax = duty(v.topology, v.vinMin, v.vout, v.vf, eta);
    const vOff = offVoltage(v.topology, v.vout, v.vf, eta);
    const dI = inductorRipple(vOff, dMin, v.fsw, v.L);
    const wave = rippleWave(dI, dMin, v.fsw, v.Cout, v.esr);
    const dV = Math.max(...wave.vout) - Math.min(...wave.vout);
    const pout = v.vout * v.iout;
    // Input capacitor: RMS current Iout·√(D(1−D)) is largest at D = 0.5.
    const dWorst =
      dMin <= 0.5 && dMax >= 0.5 ? 0.5 : Math.abs(dMin - 0.5) < Math.abs(dMax - 0.5) ? dMin : dMax;
    const icinRms = v.iout * Math.sqrt(dWorst * (1 - dWorst));
    const cinMin = (v.iout * dWorst * (1 - dWorst)) / (v.fsw * 0.01 * v.vinMin);
    const div = bestRatio(v.vout / v.vref - 1, s.series.R, {
      bottomMin: 1e3,
      bottomMax: 100e3,
      bottomPreferred: 10e3,
    });
    const warnings: Warning<Key>[] = [];
    if (dMax > 0.9) {
      warnings.push({
        field: 'vinMin',
        message: `The duty cycle at V_in,min is ${(dMax * 100).toFixed(0)} %, above the ~90 % maximum of many controllers.`,
      });
    }
    if (dMin < 0.05) {
      warnings.push({
        field: 'vinMax',
        message: `The duty cycle at V_in,max is only ${(dMin * 100).toFixed(1)} %: an on-time of ${formatSI(dMin / v.fsw, 's')} may be below the controller's minimum.`,
      });
    }
    if (v.iout < dI / 2) {
      warnings.push({
        field: 'iout',
        message:
          v.topology === 'async'
            ? `I_out is below ΔI_L/2 = ${formatSI(dI / 2, 'A')}: the converter runs in discontinuous conduction and these formulas no longer apply. Use a larger L.`
            : `I_out is below ΔI_L/2 = ${formatSI(dI / 2, 'A')}: in forced-PWM mode the inductor current reverses each cycle.`,
      });
    }
    return ok(
      {
        out: {
          dMin,
          dMax,
          dI,
          ipk: v.iout + dI / 2,
          ivalley: v.iout - dI / 2,
          irms: Math.sqrt(v.iout ** 2 + dI ** 2 / 12),
          dV,
          dVcap: dI / (8 * v.fsw * v.Cout),
          dVesr: dI * v.esr,
          icoutRms: dI / Math.sqrt(12),
          cinMin,
          icinRms,
          iinAvg: pout / (eta * v.vinMin),
          pout,
          ploss: pout * (1 / eta - 1),
          iCrit: dI / 2,
          rTop: div.top,
          rBot: div.bottom,
          voutSet: v.vref * (1 + div.top / div.bottom),
          iDivider: v.vref / div.bottom,
          fLC: 1 / (2 * Math.PI * Math.sqrt(v.L * v.Cout)),
          fEsr: v.esr > 0 ? 1 / (2 * Math.PI * v.esr * v.Cout) : NaN,
          vc0: wave.vc0,
        },
        achieved: { rippleI: (100 * dI) / v.iout, rippleV: dV },
      },
      warnings,
    );
  },
  results: (v, o) => [
    {
      label: 'Duty cycle',
      symbol: 'D',
      value: `${formatNum(o.dMin * 100, 3)}–${formatNum(o.dMax * 100, 3)}`,
      unit: '%',
      headline: true,
    },
    { label: 'Inductor', symbol: 'L', value: v.L, unit: 'H', headline: true, sig: 3 },
    { label: 'Peak inductor current', symbol: 'I_pk', value: o.ipk, unit: 'A', headline: true },
    {
      label: 'Output ripple',
      symbol: 'ΔV_out',
      value: o.dV,
      unit: 'V',
      headline: true,
      achieved: 'rippleV',
      sig: 3,
    },
    { label: 'At V_in,max', symbol: 'D', value: o.dMin * 100, unit: '%', sig: 3, group: 'Duty cycle' },
    { label: 'At V_in,min', symbol: 'D', value: o.dMax * 100, unit: '%', sig: 3, group: 'Duty cycle' },
    { label: 'On-time at V_in,max', value: o.dMin / v.fsw, unit: 's', group: 'Duty cycle' },
    {
      label: 'Ripple current (peak to peak)',
      symbol: 'ΔI_L',
      value: o.dI,
      unit: 'A',
      group: 'Inductor',
      achieved: 'rippleI',
      note: `${formatNum((100 * o.dI) / v.iout, 3)} % of I_out`,
    },
    { label: 'Peak current', symbol: 'I_pk', value: o.ipk, unit: 'A', group: 'Inductor' },
    { label: 'Valley current', value: o.ivalley, unit: 'A', group: 'Inductor' },
    { label: 'RMS current', symbol: 'I_L,rms', value: o.irms, unit: 'A', group: 'Inductor' },
    {
      label: 'CCM/DCM boundary load',
      symbol: 'ΔI_L/2',
      value: o.iCrit,
      unit: 'A',
      group: 'Inductor',
      note:
        v.topology === 'async'
          ? 'discontinuous below this load'
          : 'current reverses below this load (forced PWM)',
    },
    {
      label: 'Output capacitor',
      symbol: 'C_out',
      value: v.Cout,
      unit: 'F',
      sig: 3,
      group: 'Output capacitor',
    },
    {
      label: 'Ripple, capacitive term',
      symbol: 'ΔI_L/(8f_swC)',
      value: o.dVcap,
      unit: 'V',
      sig: 3,
      group: 'Output capacitor',
    },
    {
      label: 'Ripple, ESR term',
      symbol: 'ΔI_L·ESR',
      value: o.dVesr,
      unit: 'V',
      sig: 3,
      group: 'Output capacitor',
    },
    { label: 'RMS ripple current', value: o.icoutRms, unit: 'A', group: 'Output capacitor' },
    { label: 'LC resonance', symbol: 'f_LC', value: o.fLC, unit: 'Hz', group: 'Output capacitor' },
    ...(Number.isFinite(o.fEsr)
      ? [{ label: 'ESR zero', symbol: 'f_ESR', value: o.fEsr, unit: 'Hz', group: 'Output capacitor' }]
      : []),
    {
      label: 'Minimum capacitance (1 % ripple)',
      symbol: 'C_in',
      value: o.cinMin,
      unit: 'F',
      sig: 3,
      group: 'Input capacitor',
    },
    {
      label: 'RMS ripple current',
      symbol: 'I_Cin,rms',
      value: o.icinRms,
      unit: 'A',
      group: 'Input capacitor',
      note: 'I_out·√(D(1−D)), worst case over V_in',
    },
    { label: 'Top resistor', symbol: 'R_top', value: o.rTop, unit: 'Ω', sig: 3, group: 'Feedback divider' },
    {
      label: 'Bottom resistor',
      symbol: 'R_bot',
      value: o.rBot,
      unit: 'Ω',
      sig: 3,
      group: 'Feedback divider',
    },
    {
      label: 'Output voltage set',
      symbol: 'V_ref(1 + R_top/R_bot)',
      value: o.voutSet,
      unit: 'V',
      group: 'Feedback divider',
      note: `${formatNum(((o.voutSet - v.vout) / v.vout) * 100, 3)} % from target`,
    },
    { label: 'Divider current', value: o.iDivider, unit: 'A', group: 'Feedback divider' },
    { label: 'Output power', value: o.pout, unit: 'W', group: 'Power' },
    { label: 'Estimated loss', value: o.ploss, unit: 'W', group: 'Power' },
    { label: 'Average input current at V_in,min', value: o.iinAvg, unit: 'A', group: 'Power' },
  ],
  schematic: (v, o) => {
    const sync = v.topology === 'sync';
    return kicad(sync ? sheetSync : sheetAsync, {
      title: 'Buck converter schematic',
      desc: `V_in switches through Q1 to the switch node; ${sync ? 'Q2' : 'Schottky diode D1'} returns the inductor current when Q1 is off. L (${formatSI(v.L, 'H')}) and C_out (${formatSI(v.Cout, 'F')}) filter the output; R_top and R_bot feed back to the controller.`,
      vars: {
        VIN: `${formatSI(v.vinMin, 'V')}–${formatSI(v.vinMax, 'V')}`,
        L: formatSI(v.L, 'H'),
        ...(sync ? {} : { VF: formatSI(v.vf, 'V') }),
        COUT: formatSI(v.Cout, 'F'),
        ESR: formatSI(v.esr, 'Ω'),
        RLOAD: formatSI(v.vout / v.iout, 'Ω'),
        RTOP: formatSI(o.rTop, 'Ω'),
        RBOT: formatSI(o.rBot, 'Ω'),
      },
    });
  },
  plots: (v, o) => {
    const T = 1 / v.fsw;
    const d = o.dMin;
    const wave = rippleWave(o.dI, d, v.fsw, v.Cout, v.esr, 200);
    const t: number[] = [];
    const iL: number[] = [];
    const vsw: number[] = [];
    const vr: number[] = [];
    const vLow = v.topology === 'async' ? -v.vf : 0;
    for (let p = 0; p < 3; p++) {
      wave.t.forEach((tk, k) => {
        if (p > 0 && k === 0) return;
        t.push(p * T + tk);
        iL.push(v.iout + wave.iC[k]!);
        vr.push(wave.vout[k]!);
        const x = tk / T;
        vsw.push(x < d ? v.vinMax : vLow);
      });
    }
    const f = logspace(
      10 ** Math.floor(Math.log10(o.fLC) - 2),
      10 ** Math.ceil(Math.log10(Math.max(o.fLC * 100, v.fsw))),
      400,
    );
    const h = f.map((x) => outputFilter(v.L, v.Cout, v.esr, v.vout / v.iout, jw(x)));
    return [
      {
        kind: 'waveform',
        title: 'Waveforms at V_in,max',
        desc: `Over three switching periods at ${formatSI(v.vinMax, 'V')} in: the inductor current ramps between ${formatSI(o.ivalley, 'A')} and ${formatSI(o.ipk, 'A')}, the switch node swings between ${formatSI(v.vinMax, 'V')} and ${formatSI(vLow, 'V')}, and the output ripple is ${formatSI(o.dV, 'V')} peak to peak.`,
        x: t,
        xLabel: 'Time',
        xUnit: 's',
        panels: [
          {
            label: 'Inductor current',
            unit: 'A',
            series: [{ name: 'i_L', y: iL, color: 0 }],
            refs: [{ y: v.iout, label: 'I_out' }],
          },
          { label: 'Switch node', unit: 'V', series: [{ name: 'v_SW', y: vsw, color: 1 }] },
          { label: 'Output ripple', unit: 'V', series: [{ name: 'v_out − V_out', y: vr, color: 2 }] },
        ],
      },
      {
        kind: 'bode',
        title: 'Output LC filter',
        desc: `Response from the switch node to the output with the ${formatSI(v.vout / v.iout, 'Ω')} load: a resonant peak at ${formatSI(o.fLC, 'Hz')}, then −40 dB per decade${Number.isFinite(o.fEsr) ? `, flattening to −20 dB per decade above the ESR zero at ${formatSI(o.fEsr, 'Hz')}` : ''}.`,
        f,
        series: [
          {
            name: 'V_out / V_SW',
            db: h.map((x) => toDb(x.abs())),
            phase: unwrap(h.map((x) => deg(x.arg()))),
          },
        ],
        markers: [
          { x: o.fLC, label: 'f_LC' },
          ...(Number.isFinite(o.fEsr) ? [{ x: o.fEsr, label: 'f_ESR' }] : []),
          { x: v.fsw, label: 'f_sw' },
        ],
      },
    ];
  },
  guide: (v, o, s) => guide(v, o, s),
  spice: (v, o) => {
    const sync = v.topology === 'sync';
    const eta = v.eta / 100;
    const T = 1 / v.fsw;
    const ton = o.dMin * T;
    const tr = T / 1000;
    const n = new Netlist(`Buck converter (${sync ? 'synchronous' : 'asynchronous'}), open loop`, 'buck');
    n.comment(
      `Power stage at V_in,max = ${formatSI(v.vinMax, 'V')} (worst-case ripple), fixed duty ${(o.dMin * 100).toFixed(2)} %.`,
    );
    n.comment(
      'L and C_out start at their steady-state current and voltage (IC=, uic), so it settles in a few cycles.',
    );
    n.comment('I(VIL) is the inductor current.');
    n.add('Vin', ['vin', '0'], v.vinMax);
    n.add('Vg1', ['g1', '0'], pulse(0, 1, 0, tr, tr, ton - tr, T));
    n.add('S1', ['vin', 'sw', 'g1', '0'], 'SWMOD');
    if (sync) {
      n.add('Vg2', ['g2', '0'], pulse(1, 0, 0, tr, tr, ton - tr, T));
      n.add('S2', ['sw', '0', 'g2', '0'], 'SWMOD');
    } else {
      // Is set so that the diode drops V_F at I_out.
      n.add('D1', ['0', 'sw'], 'DSCH');
    }
    n.add('VIL', ['sw', 'lx'], 0);
    n.add('L1', ['lx', sync ? 'lr' : 'out'], v.L, `IC=${spiceValue(o.ivalley)}`);
    if (sync) {
      n.section(`Lumped conduction loss for the ${v.eta} % efficiency estimate`);
      n.add('Rloss', ['lr', 'out'], (v.vout * (1 / eta - 1)) / v.iout);
    }
    n.add('Cout', ['out', 'cx'], v.Cout, `IC=${spiceValue(v.vout + o.vc0)}`);
    n.add('Resr', ['cx', '0'], Math.max(v.esr, 1e-6));
    n.add('Rload', ['out', '0'], v.vout / v.iout);
    n.add('Rtop', ['out', 'fb'], o.rTop);
    n.add('Rbot', ['fb', '0'], o.rBot);
    n.model('SWMOD', 'SW', { Ron: 1e-3, Roff: 1e6, Vt: 0.5, Vh: 0 });
    if (!sync) n.model('DSCH', 'D', { Is: v.iout * Math.exp(-v.vf / 0.025852), N: 1, Rs: 0 });
    n.analysis(
      `.tran ${spiceValue(T / 400)} ${spiceValue(simCycles(v.fsw, o.fLC) * T)} 0 ${spiceValue(T / 400)} uic`,
    );
    return n;
  },
});

function guide(v: V, o: Out, s: Settings): GuideItem[] {
  const sync = v.topology === 'sync';
  const items: GuideItem[] = [
    {
      status: 'info',
      title: `Inductor: I_sat ≥ ${formatSI(1.3 * o.ipk, 'A')}, I_rms ≥ ${formatSI(o.irms, 'A')}`,
      text: `The peak current is ${formatSI(o.ipk, 'A')} at full load; allow 20–30 % margin for load transients and the controller's current limit. Choose a shielded inductor with its DC resistance low enough for the efficiency target (I_rms²·DCR = ${formatSI(o.irms ** 2 * 0.02, 'W')} at 20 mΩ).`,
    },
    {
      status: 'warn',
      title: 'Ceramic C_out loses capacitance under DC bias',
      text: `An X5R/X7R capacitor at ${formatSI(v.vout, 'V')} of bias often has half its nominal capacitance or less, especially in small packages. Check the manufacturer's DC-bias curve: the ${formatSI(v.Cout, 'F')} here is the effective capacitance needed after derating. Ripple current rating ≥ ${formatSI(o.icoutRms, 'A')} rms.`,
    },
    {
      status: 'info',
      title: `Input capacitor: ≥ ${formatSI(o.cinMin, 'F')}, ripple current ≥ ${formatSI(o.icinRms, 'A')} rms`,
      text: 'Place ceramic input capacitors right at the switch and rectifier to keep the high-di/dt loop small. The input RMS current I_out·√(D(1−D)) is often the hardest rating to meet; split it across several capacitors.',
    },
    {
      status: 'info',
      title: `MOSFET${sync ? 's' : ''}: V_DS ≥ ${formatSI(1.25 * v.vinMax, 'V')}, I_D ≥ ${formatSI(o.ipk, 'A')}`,
      text: `Allow at least 25 % above V_in,max for switching ringing. Conduction loss is I_rms²·R_DS(on) (weighted by D${sync ? ' for Q1 and 1 − D for Q2' : ''}); switching loss grows with f_sw and V_in.`,
    },
    sync
      ? {
          status: 'info',
          title: 'Synchronous rectifier',
          text: "Q2 replaces the diode and cuts conduction loss at low output voltages. The controller's dead time prevents shoot-through; Q2's body diode (or a small Schottky across it) conducts during the dead time.",
        }
      : {
          status: 'info',
          title: `Schottky diode: V_R ≥ ${formatSI(1.25 * v.vinMax, 'V')}, I_F(avg) ≥ ${formatSI(v.iout * (1 - o.dMin), 'A')}`,
          text: `The diode conducts for 1 − D of each cycle and dissipates about V_F·I_out·(1 − D) = ${formatSI(v.vf * v.iout * (1 - o.dMin), 'W')}. A Schottky has a low V_F and negligible reverse recovery; at low output voltages, a synchronous design is more efficient.`,
        },
    {
      status: 'info',
      title: `Controller current limit ≥ ${formatSI(o.ipk, 'A')}`,
      text: 'The switch current limit must be above the peak inductor current at full load, and below the inductor saturation current, so that a short circuit cannot saturate the inductor.',
    },
    {
      status: o.iDivider >= 10e-6 && o.iDivider <= 1e-3 ? 'ok' : 'warn',
      title: `Feedback divider: ${formatSI(o.rTop, 'Ω')} / ${formatSI(o.rBot, 'Ω')} (${s.series.R === 'none' ? 'exact' : s.series.R})`,
      text: `It sets V_out to ${formatSI(o.voutSet, 'V')} and draws ${formatSI(o.iDivider, 'A')}. Keep the divider current well above the feedback pin's bias current (often ≥ 10 µA), but low enough to waste little power at light load. Place R_bot close to the FB pin and route FB away from the switch node.`,
    },
  ];
  return items;
}
