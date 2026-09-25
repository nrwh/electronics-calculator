// ngspice checks run in CI (npm run spice-check). The design comes from the same pipeline as
// the page; each `meas` result must match the calculator within the tolerance.

import type { SpiceCase } from '../types';
import type { Out } from './index';

export default [
  {
    name: 'defaults',
    solve: 'R2',
    control: ['let vout = v(out)', 'print vout'],
    checks: [{ meas: 'vout', label: 'output voltage', expected: (r) => (r.out as Out).Vout, relTol: 0.001 }],
  },
] satisfies SpiceCase[];
