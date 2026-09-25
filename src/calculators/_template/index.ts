// Starting point for a new calculator: a resistive voltage divider, complete end to end.
// Replace the maths, schematic, plots, guide and netlist with your own. See CONTRIBUTING.md.

import { Netlist } from '../../lib/spice';
import { formatSI } from '../../lib/units';
import { Sheet } from '../../schematic/draw';
import { ground, resistor, terminal, vdc } from '../../schematic/symbols';
import { defineCalculator, fail, ok, part, qty } from '../types';

// 1. Declare every quantity once. `part` variables are snapped to the E-series when solved for.
const vars = {
  Vin: qty({ label: 'Input voltage', symbol: 'V_in', unit: 'V', default: '12' }),
  Vout: qty({ label: 'Output voltage', symbol: 'V_out', unit: 'V', default: '3.3' }),
  R1: part('R', { label: 'Top resistor', symbol: 'R_1', default: '10k' }),
  R2: part('R', { label: 'Bottom resistor', symbol: 'R_2', default: '3.9k' }),
};

// 2. Everything analyse() computes, passed to results, schematic, plots, guide and spice.
export interface Out {
  Vout: number;
  ratio: number;
  current: number;
}

export default defineCalculator<typeof vars, Out>({
  vars,
  urlVersion: 1,
  // 3. What the user can solve for. The first option is the default.
  solveFor: [
    { id: 'R2', label: 'R_2', targets: ['R2'] },
    { id: 'Vout', label: 'V_out', targets: ['Vout'] },
  ],
  // 4. Stage 1: ideal (unsnapped) values for the targets. Never throw: return fail(...) instead.
  solve: {
    R2: ({ Vin, Vout, R1 }) =>
      Vout >= Vin ? fail('Vout', 'Must be below the input voltage') : ok({ R2: (R1 * Vout) / (Vin - Vout) }),
    Vout: ({ Vin, R1, R2 }) => ok({ Vout: (Vin * R2) / (R1 + R2) }),
  },
  // 5. Stage 2: every variable is known (solved parts are snapped). Report `achieved` for inputs
  //    the design should hit, so the page can show target → achieved → error and the spread.
  analyse: (v) => {
    const Vout = (v.Vin * v.R2) / (v.R1 + v.R2);
    return ok({ out: { Vout, ratio: Vout / v.Vin, current: v.Vin / (v.R1 + v.R2) }, achieved: { Vout } });
  },
  results: (_v, o) => [
    { label: 'Output voltage', symbol: 'V_out', value: o.Vout, unit: 'V', headline: true, achieved: 'Vout' },
    { label: 'Divider current', value: o.current, unit: 'A', headline: true },
    { label: 'Ratio', symbol: 'V_out/V_in', value: o.ratio, unit: 'V/V' },
  ],
  schematic: (v) => {
    const s = new Sheet(
      22,
      13,
      'Voltage divider schematic',
      `R1 ${formatSI(v.R1, 'Ω')} from the input to the output, R2 ${formatSI(v.R2, 'Ω')} from the output to ground.`,
    );
    const src = s.place(vdc, 3, 2, { ref: 'V1', value: formatSI(v.Vin, 'V') });
    const r1 = s.place(resistor, 12, 2, { rot: 90, ref: 'R1', value: formatSI(v.R1, 'Ω') });
    const r2 = s.place(resistor, 12, 7, { rot: 90, ref: 'R2', value: formatSI(v.R2, 'Ω') });
    s.place(terminal, 18, 6, { ref: 'V_out' });
    s.wire(src.pin('p'), [3, 2], r1.pin('a'));
    s.wire(r1.pin('b'), r2.pin('a'));
    s.wire([12, 6], [18, 6]).dot([12, 6]);
    s.wire(src.pin('n'), [3, 11], [12, 11], r2.pin('b'));
    s.place(ground, 8, 11);
    return s.render();
  },
  guide: (v) => [
    {
      status: v.R1 + v.R2 > 1e6 ? 'warn' : 'ok',
      title: 'Divider impedance',
      text: 'The load on the output must be much higher than R1 ∥ R2, or buffer the output.',
    },
  ],
  spice: (v) => {
    const n = new Netlist('Voltage divider', '__ID__');
    n.add('V1', ['in', '0'], v.Vin);
    n.add('R1', ['in', 'out'], v.R1);
    n.add('R2', ['out', '0'], v.R2);
    n.analysis('.op');
    return n;
  },
});
