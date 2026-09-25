import type { SpiceCase, SpiceDesign } from '../types';
import type { Out } from './index';

const out = (r: SpiceDesign): Out => r.out as Out;
const num = (x: number): string => x.toExponential(6);

// Measure the period over 20 cycles once the amplitude has settled (the netlist runs 80 cycles),
// and the peak amplitude over the last 10.
const control = (r: SpiceDesign): string[] => {
  const T = 1 / out(r).f0;
  return [
    'setplot tran1',
    'meas tran t1 when v(out)=0 rise=50',
    'meas tran t2 when v(out)=0 rise=70',
    'let f0sim = 20/(t2-t1)',
    'print f0sim',
    `meas tran vpk max v(out) from=${num(68 * T)} to=${num(80 * T)}`,
  ];
};

const checks = [
  {
    meas: 'f0sim',
    label: 'oscillation frequency',
    expected: (r: SpiceDesign) => out(r).f0Real,
    relTol: 0.02,
  },
  // Describing-function amplitude with the same diode law as the netlist's model.
  { meas: 'vpk', label: 'amplitude', expected: (r: SpiceDesign) => out(r).amplitude, relTol: 0.05 },
];

export default [
  { name: 'solve R (defaults)', solve: 'R', control, checks },
  {
    name: 'solve C, 10 kHz, fast op-amp',
    solve: 'C',
    raw: { f0: '10k', R: '4.7k', gbw: '10M' },
    control,
    checks,
  },
  {
    name: 'solve f0, 5 V amplitude',
    solve: 'f0',
    raw: { R: '10k', C: '100n', vpk: '5', margin: '10' },
    control,
    checks,
  },
] satisfies SpiceCase[];
