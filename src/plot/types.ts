// Plot specifications returned by calculators. Rendering lives in bode.ts, waveform.ts, timing.ts.

export interface Marker {
  x: number;
  label: string;
}

export interface BodeSeries {
  name: string;
  db: number[];
  /** Omit to leave the series out of the phase panel. */
  phase?: number[];
  dashed?: boolean;
  /** Palette index 0–3. */
  color?: number;
}

export interface BodePlot {
  kind: 'bode';
  title: string;
  desc: string;
  f: number[];
  series: BodeSeries[];
  markers?: Marker[];
  /** Fixed magnitude range in dB; auto when omitted. */
  dbRange?: [number, number];
  /** Magnitude axis label (default "Magnitude"). */
  magLabel?: string;
  showPhase?: boolean;
}

export interface WaveSeries {
  name: string;
  y: number[];
  dashed?: boolean;
  color?: number;
}

export interface WavePanel {
  label: string;
  unit: string;
  series: WaveSeries[];
  /** Horizontal reference lines. */
  refs?: { y: number; label: string }[];
  /** Fixed y range; auto when omitted. */
  range?: [number, number];
}

export interface WaveformPlot {
  kind: 'waveform';
  title: string;
  desc: string;
  x: number[];
  xLabel: string;
  xUnit: string;
  panels: WavePanel[];
  markers?: Marker[];
}

export interface TimingSignal {
  name: string;
  /** One value per clock period. */
  values: (0 | 1)[];
}

export interface TimingPlot {
  kind: 'timing';
  title: string;
  desc: string;
  /** Seconds per step. */
  period: number;
  /** Draw a clock row with two edges per step. */
  clock: boolean;
  signals: TimingSignal[];
  /** Optional labels written under each step (e.g. the state number). */
  stepLabels?: string[];
}

export type PlotSpec = BodePlot | WaveformPlot | TimingPlot;
