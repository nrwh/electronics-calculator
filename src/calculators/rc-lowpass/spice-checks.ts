import type { SpiceCase } from '../types';
import type { Out } from './index';

const fcCheck = {
  meas: 'fc',
  label: '−3 dB frequency',
  expected: (r: { out: unknown }) => (r.out as Out).fc,
  relTol: 0.01,
};

const tauCheck = {
  meas: 't63',
  label: 'time to 63 % (τ)',
  expected: (r: { out: unknown }) => (r.out as Out).tau,
  relTol: 0.01,
};

const control = [
  'setplot ac1',
  'meas ac fc when vdb(out)=-3.0103',
  'setplot tran1',
  'meas tran t63 when v(out)=0.632121 rise=1',
];

export default [
  { name: 'solve R (defaults)', solve: 'R', control, checks: [fcCheck, tauCheck] },
  { name: 'solve C, 50 Hz', solve: 'C', raw: { fc: '50', R: '47k' }, control, checks: [fcCheck, tauCheck] },
  {
    name: 'solve fc, 2.2 MHz range',
    solve: 'fc',
    raw: { R: '72', C: '1n' },
    control,
    checks: [fcCheck, tauCheck],
  },
] satisfies SpiceCase[];
