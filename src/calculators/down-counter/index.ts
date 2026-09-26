// Modulo-N synchronous down counter built from D flip-flops and 2-input gates.

import { type Implicant, formatSop, literalCount } from '../../lib/logic';
import { Netlist, pulse, spiceValue } from '../../lib/spice';
import { formatNum, formatSI } from '../../lib/units';
import { kicad } from '../../schematic/kicad';
import sheet1 from './schematic-1ff.kicad_sch';
import sheet2 from './schematic-2ff.kicad_sch';
import sheet3 from './schematic-3ff.kicad_sch';
import sheet4 from './schematic-4ff.kicad_sch';
import {
  type GuideItem,
  type ValuesOf,
  type Warning,
  choice,
  defineCalculator,
  fail,
  int,
  ok,
  qty,
} from '../types';
import {
  type CounterDesign,
  type PathTiming,
  type Timing,
  bitWaveform,
  designDownCounter,
  pathTiming,
} from './design';

interface FamilyPoint {
  vcc: number;
  /** Nanoseconds: clock to Q ('74), 2-input AND ('08), 2-input OR ('32), set-up time. */
  tcq: number;
  tand: number;
  tor: number;
  tsu: number;
}

interface Family {
  name: string;
  vccMin: number;
  vccMax: number;
  /** Typical datasheet maximums at 25 °C, ascending in Vcc. */
  points: FamilyPoint[];
}

export const FAMILIES: Record<'HC' | 'AC' | 'LVC', Family> = {
  HC: {
    name: '74HC',
    vccMin: 2,
    vccMax: 6,
    points: [
      { vcc: 2, tcq: 175, tand: 90, tor: 90, tsu: 100 },
      { vcc: 4.5, tcq: 35, tand: 18, tor: 18, tsu: 20 },
      { vcc: 6, tcq: 30, tand: 15, tor: 15, tsu: 17 },
    ],
  },
  AC: {
    name: '74AC',
    vccMin: 3,
    vccMax: 5.5,
    points: [
      { vcc: 3.3, tcq: 13.5, tand: 9.5, tor: 10, tsu: 5.5 },
      { vcc: 5, tcq: 10, tand: 7.5, tor: 7.5, tsu: 4 },
    ],
  },
  LVC: {
    name: '74LVC',
    vccMin: 1.65,
    vccMax: 3.6,
    points: [
      { vcc: 1.8, tcq: 12, tand: 10, tor: 10, tsu: 3 },
      { vcc: 2.5, tcq: 7, tand: 5.5, tor: 5.5, tsu: 2.5 },
      { vcc: 3.3, tcq: 5.2, tand: 4.3, tor: 4.3, tsu: 2 },
    ],
  },
};

/** Timing at Vcc: the table row at the highest Vcc not above it (conservative), or the lowest row. */
export function familyTiming(family: Family, vcc: number): { point: FamilyPoint; extrapolated: boolean } {
  const below = family.points.filter((p) => p.vcc <= vcc + 1e-9);
  if (below.length) return { point: below[below.length - 1]!, extrapolated: false };
  return { point: family.points[0]!, extrapolated: true };
}

const vars = {
  fclk: qty({ label: 'Clock frequency', symbol: 'f_clk', unit: 'Hz', default: '4M' }),
  N: int({
    label: 'Modulus',
    symbol: 'N',
    default: '10',
    min: 2,
    max: 16,
    help: 'The counter divides the clock by N (2–16).',
  }),
  fout: qty({
    label: 'Output frequency',
    symbol: 'f_out',
    unit: 'Hz',
    default: '400k',
    help: 'Terminal-count frequency f_clk/N.',
  }),
  family: choice({
    label: 'Logic family',
    options: [
      { value: 'HC', label: '74HC' },
      { value: 'AC', label: '74AC' },
      { value: 'LVC', label: '74LVC' },
    ],
    default: 'HC',
  }),
  vcc: qty({
    label: 'Supply voltage',
    symbol: 'V_CC',
    unit: 'V',
    default: '5',
    help: 'Sets the propagation delays from the family table.',
  }),
  timing: choice({
    label: 'Timing values',
    options: [
      { value: 'table', label: 'From family table' },
      { value: 'custom', label: 'Custom' },
    ],
    default: 'table',
  }),
  tcq: qty({
    label: 'Clock to Q',
    symbol: 't_{clk→Q}',
    unit: 's',
    default: '35n',
    showIf: { key: 'timing', values: ['custom'] },
  }),
  tpd: qty({
    label: 'Gate delay',
    symbol: 't_pd',
    unit: 's',
    default: '18n',
    showIf: { key: 'timing', values: ['custom'] },
  }),
  tsu: qty({
    label: 'Set-up time',
    symbol: 't_su',
    unit: 's',
    default: '20n',
    showIf: { key: 'timing', values: ['custom'] },
  }),
};

type V = ValuesOf<typeof vars>;
type Key = keyof typeof vars;

export interface Out {
  design: CounterDesign;
  timing: Timing;
  path: PathTiming;
  familyName: string;
  fout: number;
  margin: number;
  bits: { period: number; duty: number; values: (0 | 1)[] }[];
  tcLevels: number;
}

const bitNames = (k: number): string[] => Array.from({ length: k }, (_, i) => `Q${i}`);

/** "D2 = Q̅2·Q1 + …" for each flip-flop. */
export function equationText(d: CounterDesign, bit: number): string {
  return `D${bit} = ${formatSop(d.equations[bit]!, bitNames(d.k))}`;
}

export function tcText(k: number): string {
  return `TC = ${Array.from({ length: k }, (_, i) => `Q̅${k - 1 - i}`).join('·')}`;
}

/** One schematic per number of flip-flops (N = 2…16 needs 1 to 4). */
const SHEETS = [sheet1, sheet2, sheet3, sheet4];

const binary = (s: number, k: number): string => s.toString(2).padStart(k, '0');

export default defineCalculator<typeof vars, Out>({
  vars,
  urlVersion: 1,
  solveFor: [
    { id: 'fout', label: 'f_out', targets: ['fout'] },
    { id: 'N', label: 'N', targets: ['N'] },
  ],
  solve: {
    fout: ({ fclk, N }) => ok({ fout: fclk / N }),
    N: ({ fclk, fout }) => {
      const N = Math.round(fclk / fout);
      if (N < 2 || N > 16) {
        return fail<Key>('fout', `Needs N = ${formatNum(fclk / fout, 3)}; this calculator covers N = 2–16`);
      }
      return ok({ N });
    },
  },
  analyse: (v) => {
    const family = FAMILIES[v.family];
    if (v.vcc < family.vccMin || v.vcc > family.vccMax) {
      return fail<Key>('vcc', `${family.name} runs from ${family.vccMin} V to ${family.vccMax} V`);
    }
    const warnings: Warning<Key>[] = [];
    let timing: Timing;
    if (v.timing === 'custom') {
      timing = { tcq: v.tcq, tand: v.tpd, tor: v.tpd, tsu: v.tsu };
    } else {
      const { point, extrapolated } = familyTiming(family, v.vcc);
      if (extrapolated) {
        warnings.push({
          field: 'vcc',
          message: `The table starts at ${point.vcc} V; below that, delays are longer than shown. Enter datasheet values with Custom timing.`,
        });
      }
      timing = {
        tcq: point.tcq * 1e-9,
        tand: point.tand * 1e-9,
        tor: point.tor * 1e-9,
        tsu: point.tsu * 1e-9,
      };
    }
    const design = designDownCounter(v.N);
    const path = pathTiming(design, timing);
    const margin = path.fmax / v.fclk;
    if (margin < 1) {
      warnings.push({
        field: 'fclk',
        message: `The clock is above f_max = ${formatSI(path.fmax, 'Hz')}: the next state will not settle before the clock edge.`,
      });
    } else if (margin < 1.5) {
      warnings.push({
        field: 'fclk',
        message: `Only ${formatNum(margin, 3)}× margin to f_max: temperature, supply and loading can use it up.`,
      });
    }
    const fout = v.fclk / v.N;
    return ok(
      {
        out: {
          design,
          timing,
          path,
          familyName: v.timing === 'custom' ? 'custom' : family.name,
          fout,
          margin,
          bits: Array.from({ length: design.k }, (_, i) => bitWaveform(design, i)),
          tcLevels: Math.ceil(Math.log2(Math.max(1, design.k))),
        },
        achieved: { fout },
      },
      warnings,
    );
  },
  results: (v, o) => {
    const d = o.design;
    const rows = [
      { label: 'Modulus', symbol: 'N', value: v.N, unit: '', headline: true },
      {
        label: 'Output frequency',
        symbol: 'f_out',
        value: o.fout,
        unit: 'Hz',
        headline: true,
        achieved: 'fout' as const,
      },
      {
        label: 'Margin to maximum clock',
        symbol: 'f_max/f_clk',
        value: `${formatNum(o.margin, 3)}×`,
        headline: true,
        status: o.margin < 1 ? ('fail' as const) : o.margin < 1.5 ? ('warn' as const) : ('ok' as const),
        note: `f_max = ${formatSI(o.path.fmax, 'Hz')}`,
      },
      { label: 'Flip-flops', value: d.k, unit: '', group: 'Design' },
      {
        label: 'Terminal count',
        value: tcText(d.k),
        group: 'Design',
        note: `high for 1 of every ${v.N} clocks (state 0)`,
      },
      ...d.equations.map((_, bit) => ({
        label: `Flip-flop ${bit}`,
        value: equationText(d, bit),
        group: 'Next-state logic',
      })),
      {
        label: 'Unused states',
        value: d.unused.length ? d.unused.map((u) => `${u.state}→${u.next}`).join(', ') : 'none',
        group: 'Next-state logic',
        note: d.unused.length
          ? `every unused state reaches the count within ${Math.max(...d.unused.map((u) => u.steps))} clock(s)${d.assigned.length ? `; ${d.assigned.join(', ')} assigned explicitly to avoid lockout` : ''}`
          : undefined,
      },
      ...Array.from({ length: 1 << d.k }, (_, st) => ({
        label: `${st} (${binary(st, d.k)})`,
        value: `→ ${d.next[st]} (${binary(d.next[st]!, d.k)})`,
        group: 'State table (present → next)',
        note:
          st >= v.N ? (d.assigned.includes(st) ? 'unused; assigned to avoid lockout' : 'unused') : undefined,
      })),
      ...o.bits.map((b, i) => ({
        label: `Q${i}`,
        value: b.period / v.fclk,
        unit: 's',
        group: 'Outputs',
        note: `period ${b.period} clock${b.period > 1 ? 's' : ''}, duty ${formatNum(b.duty * 100, 3)} %`,
      })),
      {
        label: 'Terminal count frequency',
        value: o.fout,
        unit: 'Hz',
        group: 'Outputs',
        note: `duty ${formatNum(100 / v.N, 3)} %`,
      },
      {
        label: 'Clock to Q',
        symbol: 't_{clk→Q}',
        value: o.timing.tcq,
        unit: 's',
        group: `Timing (${o.familyName}, ${formatSI(v.vcc, 'V')})`,
      },
      {
        label: 'Gate levels in the slowest path',
        value: o.path.levels,
        unit: '',
        group: `Timing (${o.familyName}, ${formatSI(v.vcc, 'V')})`,
      },
      {
        label: 'Logic delay',
        value: o.path.logicDelay,
        unit: 's',
        group: `Timing (${o.familyName}, ${formatSI(v.vcc, 'V')})`,
      },
      {
        label: 'Set-up time',
        symbol: 't_su',
        value: o.timing.tsu,
        unit: 's',
        group: `Timing (${o.familyName}, ${formatSI(v.vcc, 'V')})`,
      },
      {
        label: 'Maximum clock',
        symbol: 'f_max',
        value: o.path.fmax,
        unit: 'Hz',
        group: `Timing (${o.familyName}, ${formatSI(v.vcc, 'V')})`,
      },
      { label: 'Dual D flip-flops (’74)', value: Math.ceil(d.k / 2), unit: 'packages', group: 'Parts' },
      {
        label: 'Quad 2-input AND (’08)',
        value: Math.ceil((o.path.ands + Math.max(0, d.k - 1)) / 4),
        unit: 'packages',
        group: 'Parts',
        note: `${o.path.ands} for the next-state logic, ${Math.max(0, d.k - 1)} for TC`,
      },
      {
        label: 'Quad 2-input OR (’32)',
        value: Math.ceil(o.path.ors / 4),
        unit: 'packages',
        group: 'Parts',
        note: `${o.path.ors} gates`,
      },
    ];
    return rows;
  },
  schematic: (v, o) => {
    const d = o.design;
    const eqs = Object.fromEntries(d.equations.map((_, i) => [`EQ${i}`, equationText(d, i)]));
    return kicad(SHEETS[d.k - 1]!, {
      title: 'Down counter schematic',
      desc: `${d.k} D flip-flops share the clock. Each D input is driven by its next-state equation: ${d.equations.map((_, i) => equationText(d, i)).join('; ')}.`,
      vars: { ...eqs, FCLK: formatSI(v.fclk, 'Hz'), TC: tcText(d.k), N: String(v.N) },
    });
  },
  plots: (v, o) => {
    const d = o.design;
    const steps = Math.min(2 * v.N + 2, 34);
    const states = Array.from({ length: steps }, (_, i) => d.sequence[i % d.n]!);
    return [
      {
        kind: 'timing',
        title: 'Timing diagram',
        desc: `Counting down from ${v.N - 1} to 0 and wrapping, over ${steps} clock periods of ${formatSI(1 / v.fclk, 's')}. TC is high for one clock in every ${v.N}.`,
        period: 1 / v.fclk,
        clock: true,
        signals: [
          ...Array.from({ length: d.k }, (_, j) => {
            const bit = d.k - 1 - j;
            return { name: `Q${bit}`, values: states.map((s) => ((s >> bit) & 1) as 0 | 1) };
          }),
          { name: 'TC', values: states.map((s) => (s === 0 ? 1 : 0) as 0 | 1) },
        ],
        stepLabels: states.map(String),
      },
    ];
  },
  guide: (v, o) => guide(v, o),
  spice: (v, o) => netlist(v, o),
});

function guide(v: V, o: Out): GuideItem[] {
  const d = o.design;
  return [
    {
      status: o.margin >= 1.5 ? 'ok' : o.margin >= 1 ? 'warn' : 'fail',
      title: `Logic family: f_max ${formatSI(o.path.fmax, 'Hz')} vs ${formatSI(v.fclk, 'Hz')} clock`,
      text: `The slowest path is clock-to-Q (${formatSI(o.timing.tcq, 's')}), ${o.path.levels} gate level${o.path.levels === 1 ? '' : 's'} (${formatSI(o.path.logicDelay, 's')}) and set-up (${formatSI(o.timing.tsu, 's')}). Delays grow with temperature and load capacitance and fall with V_CC; aim for at least 1.5× margin, or choose a faster family (74HC < 74AC < 74LVC at 3.3 V).`,
    },
    {
      status: 'info',
      title: 'Fan-out',
      text: `Each Q and Q̅ output drives several gate inputs (up to ${Math.max(...d.equations.map((eq) => eq.length))} terms per equation). CMOS inputs draw almost no DC current, but every input adds 3–10 pF, which slows the edges: allow about 1 ns per 5 pF on 74HC at 5 V.`,
    },
    {
      status: 'info',
      title: 'Decoupling',
      text: 'Put a 100 nF ceramic capacitor from V_CC to ground at every package, with short traces. Fast families (74AC, 74LVC) switch hard enough to cause ground bounce; keep the clock trace short and terminated if it is long.',
    },
    {
      status: 'info',
      title: 'Glitch-free terminal count',
      text: 'TC is decoded from several outputs that change at slightly different times, so it can glitch briefly on some transitions. If TC clocks or resets another circuit, re-time it through a spare flip-flop clocked by the same clock.',
    },
    {
      status: d.assigned.length ? 'warn' : 'ok',
      title: 'Self-start',
      text: d.unused.length
        ? `The ${d.unused.length} unused state${d.unused.length === 1 ? '' : 's'} (${d.unused.map((u) => u.state).join(', ')}) all lead into the count within ${Math.max(...d.unused.map((u) => u.steps))} clock(s), so the counter recovers from any power-up state.${d.assigned.length ? ` State${d.assigned.length === 1 ? '' : 's'} ${d.assigned.join(', ')} had to be assigned explicitly because the minimised logic left ${d.assigned.length === 1 ? 'it' : 'them'} in a loop.` : ''}`
        : `N = ${v.N} uses every state of ${d.k} flip-flops, so there are no unused states.`,
    },
  ];
}

/** ngspice XSPICE netlist: d_dff, d_and, d_or with the family delays; bridges for the clock and the outputs. */
function netlist(v: V, o: Out): Netlist {
  const d = o.design;
  const T = 1 / v.fclk;
  const n = new Netlist(`Modulo-${v.N} synchronous down counter`, 'down-counter');
  n.ngspiceOnly = true;
  n.comment(`ngspice only (XSPICE digital models). ${o.familyName} delays at ${formatSI(v.vcc, 'V')}.`);
  n.comment(`Starts in state ${v.N - 1} and counts down; plot v(aq0) ... v(aq${d.k - 1}) and v(atc).`);
  n.comment(d.equations.map((_, i) => equationText(d, i).replace(/̅/g, "'")).join('\n'));
  n.add('Vclk', ['clk', '0'], pulse(0, v.vcc, T / 2, T / 100, T / 100, T / 2 - T / 100, T));
  n.raw('Aclk [clk] [dclk] adcclk');
  let gate = 0;
  const lit = (bit: number, positive: boolean): string => (positive ? `q${bit}` : `qb${bit}`);
  /** Reduce nets with a tree of 2-input gates; returns the output net. */
  const tree = (nets: string[], kind: 'and' | 'or'): string => {
    let level = nets;
    while (level.length > 1) {
      const next: string[] = [];
      for (let i = 0; i < level.length; i += 2) {
        if (i + 1 >= level.length) {
          next.push(level[i]!);
          continue;
        }
        const out = `${kind}${++gate}`;
        n.raw(`A${kind}${gate} [${level[i]} ${level[i + 1]}] ${out} ${kind}2`);
        next.push(out);
      }
      level = next;
    }
    return level[0]!;
  };
  const termNets = (term: Implicant): string[] => {
    const nets: string[] = [];
    for (let i = d.k - 1; i >= 0; i--)
      if (term.mask & (1 << i)) nets.push(lit(i, Boolean(term.value & (1 << i))));
    return nets;
  };
  const initial = v.N - 1;
  for (let bit = 0; bit < d.k; bit++) {
    n.section(equationText(d, bit).replace(/̅/g, "'"));
    const eq = d.equations[bit]!;
    let dNet: string;
    if (eq.length === 0) {
      dNet = `d${bit}`;
      n.raw(`Alo${bit} d${bit} lo`);
    } else if (eq.length === 1 && literalCount(eq[0]!) === 0) {
      dNet = `d${bit}`;
      n.raw(`Ahi${bit} d${bit} hi`);
    } else {
      dNet = tree(
        eq.map((term) => tree(termNets(term), 'and')),
        'or',
      );
    }
    n.raw(`Aff${bit} ${dNet} dclk NULL NULL q${bit} qb${bit} dff${(initial >> bit) & 1}`);
  }
  n.section('Terminal count: all Q low');
  const tc =
    d.k === 1
      ? 'qb0'
      : tree(
          Array.from({ length: d.k }, (_, i) => `qb${d.k - 1 - i}`),
          'and',
        );
  const outs = Array.from({ length: d.k }, (_, i) => `q${i}`);
  n.raw(`Adac [${[...outs, tc].join(' ')}] [${[...outs.map((q) => `a${q}`), 'atc'].join(' ')}] dacout`);
  const ns = (x: number): string => spiceValue(x);
  n.model('dff0', 'd_dff', {
    clk_delay: ns(o.timing.tcq),
    set_delay: ns(o.timing.tcq),
    reset_delay: ns(o.timing.tcq),
    ic: 0,
  });
  n.model('dff1', 'd_dff', {
    clk_delay: ns(o.timing.tcq),
    set_delay: ns(o.timing.tcq),
    reset_delay: ns(o.timing.tcq),
    ic: 1,
  });
  n.model('and2', 'd_and', { rise_delay: ns(o.timing.tand), fall_delay: ns(o.timing.tand) });
  n.model('or2', 'd_or', { rise_delay: ns(o.timing.tor), fall_delay: ns(o.timing.tor) });
  n.model('hi', 'd_pullup');
  n.model('lo', 'd_pulldown');
  n.model('adcclk', 'adc_bridge', { in_low: v.vcc / 2, in_high: v.vcc / 2 });
  n.model('dacout', 'dac_bridge', { out_low: 0, out_high: v.vcc });
  n.analysis(`.tran ${spiceValue(T / 100)} ${spiceValue((2 * v.N + 1) * T)}`);
  return n;
}
