import type { SpiceCase, SpiceDesign, SpiceExpectation } from '../types';
import { flipFlopsFor } from './design';

const num = (x: number): string => x.toExponential(6);

/**
 * Sample every Q output (through the DAC bridge) midway between clock edges for two full counts,
 * and check it against the count sequence N−1, N−2, …, 0, N−1, … The first rising edge is at T/2,
 * so at t = kT the counter has seen k edges.
 */
function countCase(name: string, raw: { fclk: string; N: string; family?: string; vcc?: string }): SpiceCase {
  const N = Number(raw.N);
  const k = flipFlopsFor(N);
  const vcc = Number(raw.vcc ?? '5');
  const checks: SpiceExpectation[] = [];
  const steps = Array.from({ length: 2 * N }, (_, i) => i + 1);
  for (const step of steps) {
    const state = (((N - 1 - step) % N) + N) % N;
    for (let bit = 0; bit < k; bit++) {
      checks.push({
        meas: `s${step}b${bit}`,
        label: `Q${bit} after ${step} clock${step > 1 ? 's' : ''} (state ${state})`,
        expected: () => ((state >> bit) & 1) * vcc,
        absTol: 0.1 * vcc,
      });
    }
  }
  const control = (r: SpiceDesign): string[] => {
    const T = 1 / (r.values.fclk as number);
    const lines = ['setplot tran1'];
    for (const step of steps) {
      for (let bit = 0; bit < k; bit++)
        lines.push(`meas tran s${step}b${bit} find v(aq${bit}) at=${num(step * T)}`);
    }
    return lines;
  };
  return { name, solve: 'fout', raw, control, checks };
}

export default [
  countCase('N = 10, 74HC at 5 V', { fclk: '10M', N: '10' }),
  countCase('N = 5 (lockout check), 74LVC at 3.3 V', { fclk: '50M', N: '5', family: 'LVC', vcc: '3.3' }),
  countCase('N = 16', { fclk: '1M', N: '16' }),
  countCase('N = 2', { fclk: '1M', N: '2' }),
] satisfies SpiceCase[];
