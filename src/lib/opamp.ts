// Single-pole op-amp model (DC gain, GBW, output limits), shared by the plots and the SPICE
// subcircuit so both describe the same amplifier.

import type { Complex } from './complex';
import { c } from './complex';
import { spiceValue } from './spice';

export interface OpAmp {
  /** Open-loop DC gain (V/V). */
  a0: number;
  /** Gain-bandwidth product (Hz). */
  gbw: number;
  /** Output limits (V). */
  vmax: number;
  vmin: number;
}

export const DEFAULT_A0 = 1e5;

/** Open-loop gain A(s) = A0 / (1 + s/ωp), with the pole at GBW / A0. */
export function openLoop(op: OpAmp, s: Complex): Complex {
  const wp = (2 * Math.PI * op.gbw) / op.a0;
  return c(op.a0).div(s.div(wp).add(1));
}

export const OPAMP_SUBCKT = 'OPAMP1P';

/**
 * Portable op-amp subcircuit (ngspice and LTspice): an E-source gain stage, one RC pole, diode
 * clamps to the output limits and a unity buffer. Pins: non-inverting, inverting, output.
 */
export function opampSubckt(op: OpAmp): string {
  const r = 1e6;
  const cp = op.a0 / (2 * Math.PI * op.gbw * r);
  // The clamp diodes conduct about 0.7 V beyond their reference sources.
  const vh = op.vmax - 0.7;
  const vl = op.vmin + 0.7;
  return [
    `.subckt ${OPAMP_SUBCKT} inp inn out`,
    `* Single-pole op-amp: A0 = ${spiceValue(op.a0)}, GBW = ${spiceValue(op.gbw)}Hz, output ${spiceValue(op.vmin)} V to ${spiceValue(op.vmax)} V`,
    `E1 a 0 inp inn ${spiceValue(op.a0)}`,
    `R1 a b ${spiceValue(r)}`,
    `C1 b 0 ${spiceValue(cp)}`,
    `D1 b vh DCLAMP`,
    `D2 vl b DCLAMP`,
    `VH vh 0 ${spiceValue(vh)}`,
    `VL vl 0 ${spiceValue(vl)}`,
    `E2 out 0 b 0 1`,
    `.model DCLAMP D(Is=1e-14 N=1)`,
    `.ends ${OPAMP_SUBCKT}`,
  ].join('\n');
}
