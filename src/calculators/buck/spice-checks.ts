import type { SpiceCase, SpiceDesign } from '../types';
import { type Out, simCycles } from './index';

const out = (r: SpiceDesign): Out => r.out as Out;
const num = (x: number): string => x.toExponential(6);

// The netlist starts from near-steady-state initial conditions; measure the last 20 periods.
const control = (r: SpiceDesign): string[] => {
  const fsw = r.values.fsw as number;
  const T = 1 / fsw;
  const n = simCycles(fsw, out(r).fLC);
  const from = num((n - 20) * T);
  const to = num(n * T);
  return [
    'setplot tran1',
    `meas tran vavg avg v(out) from=${from} to=${to}`,
    `meas tran vpp pp v(out) from=${from} to=${to}`,
    `meas tran ipp pp i(VIL) from=${from} to=${to}`,
  ];
};

const checks = [
  {
    meas: 'vavg',
    label: 'average output voltage',
    expected: (r: SpiceDesign) => r.values.vout as number,
    relTol: 0.015,
  },
  {
    meas: 'vpp',
    label: 'output ripple (peak to peak)',
    expected: (r: SpiceDesign) => out(r).dV,
    relTol: 0.05,
  },
  {
    meas: 'ipp',
    label: 'inductor ripple (peak to peak)',
    expected: (r: SpiceDesign) => out(r).dI,
    relTol: 0.05,
  },
];

export default [
  { name: 'synchronous, solve L and C (defaults)', solve: 'LC', control, checks },
  {
    name: 'asynchronous, 24 V to 3.3 V',
    solve: 'LC',
    raw: { topology: 'async', vinMin: '18', vinMax: '28', vout: '3.3', iout: '1.5', fsw: '300k', esr: '20m' },
    control,
    checks,
  },
  {
    name: 'synchronous, solve ripple, 1.2 V at 5 A',
    solve: 'ripple',
    raw: {
      vinMin: '4.5',
      vinMax: '5.5',
      vout: '1.2',
      iout: '5',
      fsw: '1Meg',
      L: '1u',
      Cout: '100u',
      esr: '2m',
      eta: '85',
    },
    control,
    checks,
  },
] satisfies SpiceCase[];
