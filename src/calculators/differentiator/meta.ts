import type { CalculatorMeta } from '../types';

export default {
  id: 'differentiator',
  title: 'Analog differentiator',
  category: 'opamp',
  summary:
    'Practical op-amp differentiator (R1 in series with C, Cf across Rf): choose the band it differentiates, check phase margin against the op-amp GBW, and get E-series parts.',
  keywords: [
    'differentiator',
    'differentiater',
    'derivative',
    'op-amp',
    'opamp',
    'op amp',
    'high pass',
    'active filter',
    'rate of change',
    'stability',
    'phase margin',
    'gbw',
  ],
} satisfies CalculatorMeta;
