// Wien bridge oscillator: series RC and parallel RC set f0 = 1/(2πRC); a non-inverting amplifier
// supplies a gain of 3, set slightly higher so that it starts, with amplitude stabilisation.

import { type Complex, jw } from '../../lib/complex';
import { deg, logspace, toDb, unwrap } from '../../lib/freq';
import { nearest } from '../../lib/eseries';
import { DEFAULT_A0, OPAMP_SUBCKT, type OpAmp, openLoop, opampSubckt } from '../../lib/opamp';
import { bisect } from '../../lib/solve';
import { Netlist, spiceValue, unavailable } from '../../lib/spice';
import { formatSI, formatSlew } from '../../lib/units';
import { Sheet } from '../../schematic/draw';
import { capacitor, diode, ground, opampFlip, resistor, terminal } from '../../schematic/symbols';
import {
  type GuideItem,
  type Settings,
  type ValuesOf,
  type Warning,
  choice,
  defineCalculator,
  fail,
  ok,
  part,
  qty,
} from '../types';

const METHODS = [
  { value: 'diodes', label: 'Diodes' },
  { value: 'jfet', label: 'JFET (AGC)' },
  { value: 'ntc', label: 'NTC thermistor' },
  { value: 'lamp', label: 'Incandescent lamp' },
] as const;

const vars = {
  f0: qty({ label: 'Oscillation frequency', symbol: 'f_0', unit: 'Hz', default: '1k' }),
  R: part('R', {
    label: 'Bridge resistors',
    symbol: 'R',
    default: '16k',
    help: 'Both bridge resistors have this value.',
  }),
  C: part('C', {
    label: 'Bridge capacitors',
    symbol: 'C',
    default: '10n',
    help: 'Both bridge capacitors have this value.',
  }),
  method: choice({ label: 'Amplitude stabilisation', options: METHODS, default: 'diodes' }),
  margin: qty({
    label: 'Start-up gain margin',
    symbol: 'm',
    unit: '%',
    default: '5',
    min: 0.5,
    max: 50,
    help: 'The small-signal gain is 3·(1 + m) so that oscillation starts.',
  }),
  Rg: part('R', {
    label: 'Gain resistor',
    symbol: 'R_g',
    default: '10k',
    help: 'Inverting input to ground. With lamp stabilisation this is the lamp’s hot resistance.',
  }),
  vpk: qty({
    label: 'Target amplitude',
    symbol: 'V_pk',
    unit: 'V',
    default: '3',
    showIf: { key: 'method', values: ['diodes'] },
  }),
  vd: qty({
    label: 'Diode forward voltage at 1 mA',
    symbol: 'V_D',
    unit: 'V',
    default: '0.6',
    max: 3,
    help: 'Forward voltage at 1 mA: about 0.6 V for a 1N4148.',
    showIf: { key: 'method', values: ['diodes'] },
  }),
  gbw: qty({ label: 'Op-amp GBW', symbol: 'GBW', unit: 'Hz', default: '1M' }),
  vsat: qty({ label: 'Output swing', symbol: '±V_sat', unit: 'V', default: '12' }),
};

type V = ValuesOf<typeof vars>;
type Key = keyof typeof vars;

export interface Out {
  f0: number;
  /** Frequency where the loop phase is zero with the finite-GBW op-amp. */
  f0Real: number;
  gainStart: number;
  /** Diode method: Rf is split into Rf1 (always in circuit) and Rf2 (shunted by the diodes). */
  rf1: number;
  rf2: number;
  /** Total Rf (= rf1 + rf2 for diodes). */
  rf: number;
  amplitude: number;
  slew: number;
  gbwRecommended: number;
}

const TWO_PI = 2 * Math.PI;

/** Feedback network β(s) = Zp / (Zs + Zp) = sRC / ((sRC)² + 3sRC + 1). */
export function beta(R: number, C: number, s: Complex): Complex {
  const x = s.mul(R * C);
  return x.div(x.mul(x).add(x.mul(3)).add(1));
}

/** Non-inverting amplifier gain with a single-pole op-amp. */
export function ampGain(op: OpAmp, gain: number, s: Complex): Complex {
  const a = openLoop(op, s);
  return a.div(a.div(gain).add(1));
}

const opOf = (v: { gbw: number; vsat: number }): OpAmp => ({
  a0: DEFAULT_A0,
  gbw: v.gbw,
  vmax: v.vsat,
  vmin: -v.vsat,
});

/** Oscillation frequency with a finite-GBW op-amp: where arg(β·G) = 0 at a gain of 3. */
export function realFrequency(R: number, C: number, op: OpAmp): number {
  const f0 = 1 / (TWO_PI * R * C);
  const phase = (f: number): number =>
    beta(R, C, jw(f))
      .mul(ampGain(op, 3, jw(f)))
      .arg();
  return bisect(phase, f0 / 3, f0 * 1.5);
}

/** Emission coefficient × thermal voltage at 27 °C for a 1N4148-like small-signal diode. */
export const DIODE_NVT = 1.752 * 0.025852;

/** Saturation current that gives forward voltage vd at 1 mA. */
export const diodeIs = (vd: number): number => 1e-3 / Math.exp(vd / DIODE_NVT);

/** Voltage across Rf2 in parallel with two anti-parallel diodes, carrying current i. */
function shuntVoltage(i: number, rf2: number, is: number): number {
  if (i === 0) return 0;
  const g = (x: number): number => x / rf2 + 2 * is * Math.sinh(x / DIODE_NVT) - Math.abs(i);
  return Math.sign(i) * bisect(g, 0, Math.abs(i) * rf2, { log: false, tol: 1e-9 });
}

/**
 * Oscillation amplitude with diode stabilisation, by describing function. The bridge keeps the
 * inverting input sinusoidal at Vout/3, so a sinusoidal current A/(3Rg) flows through Rg, Rf1 and
 * the Rf2 ∥ diodes element. The output's fundamental must equal A (a loop gain of exactly 1).
 */
export function diodeAmplitude(rg: number, rf1: number, rf2: number, vd: number): number {
  const is = diodeIs(vd);
  const n = 48;
  const fundamental = (a: number): number => {
    const amp = a / (3 * rg);
    let sum = 0;
    for (let k = 0; k < n; k++) {
      const th = ((k + 0.5) * Math.PI) / n;
      const i = amp * Math.sin(th);
      sum += (i * (rg + rf1) + shuntVoltage(i, rf2, is)) * Math.sin(th);
    }
    return (2 / n) * sum;
  };
  const h = (a: number): number => fundamental(a) - a;
  // Gain barely above 3 with the diodes on: the amplitude is unbounded (the op-amp clips first).
  if (h(1e4) > 0) return Infinity;
  return bisect(h, 1e-3, 1e4, { tol: 1e-7 });
}

const rf1Cache = new Map<string, number>();

/**
 * Rf1 that gives amplitude vpk (before snapping), found with the same describing function.
 * Returns NaN when even Rf1 = 0 gives more than vpk. Cached: it depends only on these inputs.
 */
export function designRf1(rg: number, rfTotal: number, vd: number, vpk: number): number {
  const key = [rg, rfTotal, vd, vpk].join();
  const hit = rf1Cache.get(key);
  if (hit !== undefined) return hit;
  const lo = rg * 1e-6;
  const hi = 2 * rg * (1 - 1e-6);
  const g = (rf1: number): number => diodeAmplitude(rg, rf1, rfTotal - rf1, vd) - vpk;
  const rf1 = g(lo) > 0 ? NaN : bisect(g, lo, hi, { tol: 1e-6 });
  if (rf1Cache.size > 200) rf1Cache.clear();
  rf1Cache.set(key, rf1);
  return rf1;
}

function analyseDesign(v: V, s: Settings) {
  const f0 = 1 / (TWO_PI * v.R * v.C);
  const m = v.margin / 100;
  const rfIdeal = (2 + 3 * m) * v.Rg;
  const snapR = (x: number): number => nearest(x, s.series.R);
  let rf1 = NaN;
  let rf2 = NaN;
  let rf: number;
  let amplitude = NaN;
  if (v.method === 'diodes') {
    // First-order check: with a hard clamp at V_D, Vpk·(2/3) = Vpk·Rf1/(3Rg) + V_D, so Rf1 > 0
    // needs Vpk > 1.5·V_D. The design itself uses the describing function with the diode law.
    if (!(v.vpk > 1.5 * v.vd))
      return fail<Key>('vpk', `Must be above 1.5·V_D = ${formatSI(1.5 * v.vd, 'V')}`);
    const rf1Ideal = designRf1(v.Rg, rfIdeal, v.vd, v.vpk);
    if (!Number.isFinite(rf1Ideal)) {
      return fail<Key>('vpk', 'Too small for these diodes and this margin; raise it or lower the margin');
    }
    rf1 = snapR(rf1Ideal);
    rf2 = snapR(rfIdeal - rf1Ideal);
    rf = rf1 + rf2;
    amplitude = rf1 < 2 * v.Rg ? diodeAmplitude(v.Rg, rf1, rf2, v.vd) : Infinity;
  } else {
    rf = snapR(rfIdeal);
  }
  const gainStart = 1 + rf / v.Rg;
  if (gainStart <= 3) {
    return fail<Key>(
      'margin',
      `With these part values the start-up gain is ${gainStart.toFixed(3)}, which is not above 3; increase the margin`,
    );
  }
  const op = opOf(v);
  const f0Real = realFrequency(v.R, v.C, op);
  const vOut = Number.isFinite(amplitude) ? amplitude : v.vsat;
  return ok<{ out: Out; achieved: Partial<V> }, Key>({
    out: {
      f0,
      f0Real,
      gainStart,
      rf1,
      rf2,
      rf,
      amplitude,
      slew: TWO_PI * f0 * Math.min(vOut, v.vsat),
      gbwRecommended: 100 * 3 * f0,
    },
    achieved: v.method === 'diodes' ? { f0, vpk: amplitude } : { f0 },
  });
}

export default defineCalculator<typeof vars, Out>({
  vars,
  urlVersion: 1,
  solveFor: [
    { id: 'R', label: 'R', targets: ['R'] },
    { id: 'C', label: 'C', targets: ['C'] },
    { id: 'f0', label: 'f_0', targets: ['f0'] },
  ],
  solve: {
    R: ({ f0, C }) => ok({ R: 1 / (TWO_PI * f0 * C) }),
    C: ({ f0, R }) => ok({ C: 1 / (TWO_PI * f0 * R) }),
    f0: ({ R, C }) => ok({ f0: 1 / (TWO_PI * R * C) }),
  },
  analyse: (v, s) => {
    const r = analyseDesign(v, s);
    if (!r.ok) return r;
    const o = r.value.out;
    const warnings: Warning<Key>[] = [];
    if (v.method === 'diodes' && o.amplitude > v.vsat) {
      warnings.push({
        field: 'vpk',
        message: `The estimated amplitude (${formatSI(o.amplitude, 'V')}) exceeds the output swing: the op-amp will clip and distort.`,
      });
    }
    if (v.gbw < o.gbwRecommended) {
      warnings.push({
        field: 'gbw',
        message: `GBW below 100·3·f_0 = ${formatSI(o.gbwRecommended, 'Hz')} shifts the frequency (to ${formatSI(o.f0Real, 'Hz')}) and raises distortion.`,
      });
    }
    return ok(r.value, warnings);
  },
  results: (v, o) => [
    {
      label: 'Oscillation frequency',
      symbol: 'f_0',
      value: o.f0,
      unit: 'Hz',
      headline: true,
      achieved: 'f0',
    },
    {
      label: 'With op-amp GBW',
      symbol: 'f_0',
      value: o.f0Real,
      unit: 'Hz',
      headline: true,
      note: `${(((o.f0Real - o.f0) / o.f0) * 100).toFixed(2)} % from the ideal`,
    },
    ...(v.method === 'diodes'
      ? [
          {
            label: 'Amplitude',
            symbol: 'V_pk',
            value: o.amplitude,
            unit: 'V',
            headline: true,
            achieved: 'vpk' as const,
          },
        ]
      : []),
    {
      label: 'Start-up gain',
      symbol: '1 + R_f/R_g',
      value: o.gainStart,
      unit: 'V/V',
      sig: 4,
      group: 'Amplifier',
    },
    ...(v.method === 'diodes'
      ? [
          {
            label: 'Feedback resistor, always in circuit',
            symbol: 'R_f1',
            value: o.rf1,
            unit: 'Ω',
            group: 'Amplifier',
          },
          {
            label: 'Feedback resistor, shunted by diodes',
            symbol: 'R_f2',
            value: o.rf2,
            unit: 'Ω',
            group: 'Amplifier',
          },
          {
            label: 'Gain with diodes fully on',
            symbol: '1 + R_f1/R_g',
            value: 1 + o.rf1 / v.Rg,
            unit: 'V/V',
            sig: 4,
            group: 'Amplifier',
          },
        ]
      : [
          {
            label: v.method === 'ntc' ? 'NTC resistance at start-up (cold), at least' : 'Feedback resistor',
            symbol: 'R_f',
            value: o.rf,
            unit: 'Ω',
            group: 'Amplifier',
          },
          {
            label: v.method === 'ntc' ? 'NTC resistance when running (hot)' : 'Rf / Rg when running',
            value: v.method === 'ntc' ? 2 * v.Rg : 2,
            unit: v.method === 'ntc' ? 'Ω' : 'V/V',
            group: 'Amplifier',
          },
        ]),
    { label: 'Feedback network at f_0', symbol: 'β', value: 1 / 3, unit: 'V/V', sig: 3, group: 'Bridge' },
    { label: 'Required slew rate', value: o.slew / 1e6, unit: 'V/µs', sig: 3, group: 'Op-amp' },
    { label: 'Recommended GBW', symbol: '≥ 100·3·f_0', value: o.gbwRecommended, unit: 'Hz', group: 'Op-amp' },
  ],
  schematic: (v, o) => {
    const diodes = v.method === 'diodes';
    const s = new Sheet(
      31,
      21,
      'Wien bridge oscillator schematic',
      `A series R–C (${formatSI(v.R, 'Ω')}, ${formatSI(v.C, 'F')}) from the output and a parallel R–C to ground feed the non-inverting input. ${diodes ? 'Rf1 and Rf2, with anti-parallel diodes across Rf2,' : 'Rf'} and Rg set the gain.`,
    );
    const u = s.place(opampFlip, 16, 8, { ref: 'U1', labelAt: [19.2, 5.3] });
    // Parallel arm to ground.
    const rp = s.place(resistor, 5, 7, { rot: 90, ref: 'R2', value: formatSI(v.R, 'Ω'), side: 'left' });
    const cp = s.place(capacitor, 9, 7, { rot: 90, ref: 'C2', value: formatSI(v.C, 'F') });
    s.wire(rp.pin('a'), [12, 7], u.pin('in1'));
    s.wire(rp.pin('b'), cp.pin('b'));
    s.dot([9, 7]).dot([12, 7]);
    s.place(ground, 7, 11);
    // Series arm from the output.
    const cs = s.place(capacitor, 13, 3, { ref: 'C1', value: formatSI(v.C, 'F'), inline: true });
    const rs = s.place(resistor, 18, 3, { ref: 'R1', value: formatSI(v.R, 'Ω'), inline: true });
    s.wire([12, 7], [12, 3], cs.pin('a'));
    s.wire(cs.pin('b'), rs.pin('a'));
    s.wire(rs.pin('b'), [25, 3], [25, 8]);
    s.wire(u.pin('out'), [29, 8]);
    s.dot([25, 8]);
    s.place(terminal, 29, 8, { ref: 'V_out', side: 'above' });
    // Gain network.
    s.wire(u.pin('in2'), [15, 9], [15, 14]);
    const rg = s.place(resistor, 15, 14, {
      rot: 90,
      ref: v.method === 'lamp' ? 'Lamp' : 'R_g',
      value: formatSI(v.Rg, 'Ω'),
      side: 'left',
    });
    s.place(ground, rg.pin('b')[0], rg.pin('b')[1]);
    s.dot([15, 14]);
    if (diodes) {
      const rf1 = s.place(resistor, 16, 14, { ref: 'R_f1', value: formatSI(o.rf1, 'Ω') });
      const rf2 = s.place(resistor, 21, 14, { ref: 'R_f2', value: formatSI(o.rf2, 'Ω') });
      const d1 = s.place(diode, 21, 16);
      const d2 = s.place(diode, 25, 18, { rot: 180, ref: 'D1, D2', side: 'below' });
      s.wire([15, 14], rf1.pin('a'));
      s.wire(rf1.pin('b'), rf2.pin('a'));
      s.wire(rf2.pin('b'), [25, 14]);
      s.wire([20, 14], [20, 18], d2.pin('k'));
      s.wire([20, 16], d1.pin('a'));
      s.wire(d1.pin('k'), [25, 16]);
      s.wire(d2.pin('a'), [25, 18], [25, 8]);
      s.dot([20, 14]).dot([20, 16]).dot([25, 14]).dot([25, 16]);
    } else {
      const rf = s.place(resistor, 18, 14, {
        ref: v.method === 'ntc' ? 'NTC' : v.method === 'jfet' ? 'R_f (JFET AGC on R_g)' : 'R_f',
        value: formatSI(o.rf, 'Ω'),
      });
      s.wire([15, 14], rf.pin('a'));
      s.wire(rf.pin('b'), [25, 14], [25, 8]);
    }
    return s.render();
  },
  plots: (v, o) => {
    const op = opOf(v);
    const f = logspace(10 ** Math.floor(Math.log10(o.f0) - 2), 10 ** Math.ceil(Math.log10(o.f0) + 2), 400);
    const b = f.map((x) => beta(v.R, v.C, jw(x)));
    const loop = f.map((x, i) => b[i]!.mul(ampGain(op, o.gainStart, jw(x))));
    return [
      {
        kind: 'bode',
        title: 'Feedback network and loop gain',
        desc: `The Wien network passes 1/3 (−9.54 dB) with 0° phase at f_0 = ${formatSI(o.f0, 'Hz')}. With the start-up gain of ${o.gainStart.toFixed(3)}, the loop gain there is ${toDb(o.gainStart / 3).toFixed(2)} dB, just above 0 dB, so oscillation builds up.`,
        f,
        series: [
          {
            name: 'β (Wien network)',
            db: b.map((x) => toDb(x.abs())),
            phase: unwrap(b.map((x) => deg(x.arg()))),
            color: 0,
          },
          {
            name: 'Loop gain at start-up',
            db: loop.map((x) => toDb(x.abs())),
            phase: unwrap(loop.map((x) => deg(x.arg()))),
            color: 1,
            dashed: true,
          },
        ],
        markers: [{ x: o.f0, label: 'f_0' }],
      },
    ];
  },
  guide: (v, o) => guide(v, o),
  spice: (v, o) => {
    if (v.method !== 'diodes') {
      return unavailable(
        'JFET, NTC and lamp stabilisation depend on an AGC loop or a thermal time constant, which the portable netlist subset (no behavioural sources) cannot model. Choose diode stabilisation for a netlist.',
      );
    }
    const op = opOf(v);
    const T = 1 / o.f0;
    const n = new Netlist('Wien bridge oscillator', 'wien-bridge');
    n.comment(
      `f_0 = ${formatSI(o.f0, 'Hz')}, start-up gain ${o.gainStart.toFixed(3)}, estimated amplitude ${formatSI(o.amplitude, 'V')} peak`,
    );
    n.comment(
      'Transient: a 10 mV initial charge on C2 starts the oscillation; watch v(out) build up and settle.',
    );
    n.raw(`XU1 p n out ${OPAMP_SUBCKT}`);
    n.add('R1', ['out', 'a'], v.R);
    n.add('C1', ['a', 'p'], v.C);
    n.add('R2', ['p', '0'], v.R);
    n.add('C2', ['p', '0'], v.C, 'IC=10m');
    n.add('Rg', ['n', '0'], v.Rg);
    n.add('Rf1', ['n', 'm'], o.rf1);
    n.add('Rf2', ['m', 'out'], o.rf2);
    n.add('D1', ['m', 'out'], 'D1N4148');
    n.add('D2', ['out', 'm'], 'D1N4148');
    // 1N4148-like diode with Is set so that it drops V_D at 1 mA, as the calculator assumes.
    n.model('D1N4148', 'D', { Is: diodeIs(v.vd), N: 1.752, Rs: 0.568, Cjo: 4e-12 });
    n.subckt(opampSubckt(op));
    n.analysis(`.tran ${spiceValue(T / 200)} ${spiceValue(80 * T)} 0 ${spiceValue(T / 200)} uic`);
    return n;
  },
});

function guide(v: V, o: Out): GuideItem[] {
  const items: GuideItem[] = [];
  items.push({
    status: v.gbw >= o.gbwRecommended ? 'ok' : 'warn',
    title: `Op-amp GBW ≳ 100·3·f_0 = ${formatSI(o.gbwRecommended, 'Hz')}`,
    text: `The amplifier needs a gain of 3 with little phase shift at f_0. With ${formatSI(v.gbw, 'Hz')}, the frequency moves to ${formatSI(o.f0Real, 'Hz')}; more GBW also lowers distortion.`,
  });
  items.push({
    status: 'info',
    title: `Slew rate ≥ ${formatSlew(o.slew)}`,
    text: 'A sine of peak V_pk at f_0 needs 2π·f_0·V_pk. Allow a factor of 2 or more to keep slew-rate distortion down.',
  });
  items.push({
    status: 'info',
    title: 'Match the bridge components',
    text: 'The two resistors and the two capacitors should match: a mismatch shifts f_0 and changes the gain needed from 3. Use 1 % (or better) resistors and C0G/NP0 or film capacitors; X7R capacitance varies with temperature and voltage and adds distortion.',
  });
  if (v.method === 'diodes') {
    items.push({
      status: 'info',
      title: 'Diode stabilisation',
      text: `Small-signal diodes such as the 1N4148 across R_f2 reduce the gain as the amplitude grows, settling at about ${formatSI(o.amplitude, 'V')} peak. It is simple and starts reliably, but it distorts more (typically 0.5–3 % THD) than an AGC loop, and the amplitude drifts with the diodes' temperature (about −2 mV/°C each).`,
    });
  } else if (v.method === 'jfet') {
    items.push({
      status: 'info',
      title: 'JFET AGC',
      text: 'A JFET (e.g. J113) in series with R_g acts as a voltage-controlled resistor. A rectifier and RC filter on the output drive its gate negative as the amplitude grows, raising r_DS and lowering the gain. The filter time constant must be many cycles long, or the gain modulates within a cycle and distorts. Include r_DS(on) in R_g.',
    });
  } else if (v.method === 'ntc') {
    items.push({
      status: 'info',
      title: 'NTC thermistor in R_f',
      text: `The NTC's resistance falls as it self-heats, lowering the gain. It must be about ${formatSI(2 * v.Rg, 'Ω')} (2·R_g) at the operating power and above ${formatSI(o.rf, 'Ω')} when cold. Use a thermistor intended for oscillator stabilisation (small bead, in a glass envelope); its thermal time constant sets how fast the amplitude settles.`,
    });
  } else {
    items.push({
      status: 'info',
      title: 'Incandescent lamp as R_g',
      text: `A small lamp's resistance rises as it heats, lowering the gain; this is the classic low-distortion method. Choose a lamp whose hot resistance at the operating current is R_g = ${formatSI(v.Rg, 'Ω')}, and set R_f = 2·R_g. Its cold resistance is several times lower, which gives a large start-up margin. The amplitude settles slowly at low frequencies.`,
    });
  }
  items.push({
    status: 'info',
    title: 'Start-up margin',
    text: `A margin of ${v.margin} % (small-signal gain ${o.gainStart.toFixed(3)}) makes oscillation start reliably despite tolerances. Too much margin makes the stabilisation element work harder, which raises distortion; 2–10 % is typical.`,
  });
  return items;
}
