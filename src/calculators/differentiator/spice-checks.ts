import type { SpiceCase, SpiceDesign } from '../types';
import type { Out } from './index';

const out = (r: SpiceDesign): Out => r.out as Out;
const num = (x: number): string => x.toExponential(6);

// The netlist's op-amp subcircuit is the same single-pole model the calculator uses, so the
// simulated gain at f_a and f_b must match the calculated closed-loop gain closely.
const control = (r: SpiceDesign): string[] => [
  'setplot ac1',
  `meas ac gfa find vdb(out) at=${num(out(r).fa)}`,
  `meas ac gfb find vdb(out) at=${num(out(r).fb)}`,
];

const checks = [
  { meas: 'gfa', label: 'gain at f_a (dB)', expected: (r: SpiceDesign) => out(r).gainFaDb, absTol: 0.05 },
  { meas: 'gfb', label: 'gain at f_b (dB)', expected: (r: SpiceDesign) => out(r).gainFbDb, absTol: 0.05 },
];

export default [
  { name: 'solve parts (defaults)', solve: 'parts', control, checks },
  {
    name: 'solve frequencies',
    solve: 'freqs',
    raw: { Rf: '100k', R1: '1k', Cf: '1n', C: '100n', gbw: '10M' },
    control,
    checks,
  },
  {
    name: 'slow op-amp',
    solve: 'parts',
    raw: { fa: '100', fb: '5k', C: '100n', gbw: '1M' },
    control,
    checks,
  },
] satisfies SpiceCase[];
