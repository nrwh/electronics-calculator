// IEC 60617-style schematic symbols. Coordinates are in SVG user units (1 grid unit = 10);
// pin positions are in grid units. Symbols are drawn unrotated; draw.ts rotates them.
//
// Classes: .sb (symbol stroke), .sf (filled with the stroke colour), .st (small text inside a symbol).

export interface SymbolDef {
  /** Pin positions in grid units, before rotation. */
  pins: Record<string, [number, number]>;
  /** SVG markup, in user units, origin at (0, 0). */
  body: string;
  /** Where labels go (user units, unrotated) when the symbol is horizontal and vertical. */
  labelH: [number, number];
  labelV: [number, number];
  /** Text anchor for multi-pin symbols' labels (default middle). */
  labelAnchor?: 'start' | 'middle' | 'end';
}

const line = (x1: number, y1: number, x2: number, y2: number): string =>
  `<line class="sb" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
const path = (d: string, cls = 'sb'): string => `<path class="${cls}" d="${d}"/>`;

/** Resistor: IEC rectangle. Pins a (0,0), b (4,0). */
export const resistor: SymbolDef = {
  pins: { a: [0, 0], b: [4, 0] },
  body: line(0, 0, 8, 0) + `<rect class="sb" x="8" y="-5" width="24" height="10"/>` + line(32, 0, 40, 0),
  labelH: [20, -9],
  labelV: [9, 0],
};

/** Capacitor: two plates. Pins a (0,0), b (4,0). */
export const capacitor: SymbolDef = {
  pins: { a: [0, 0], b: [4, 0] },
  body: line(0, 0, 17, 0) + line(17, -10, 17, 10) + line(23, -10, 23, 10) + line(23, 0, 40, 0),
  labelH: [20, -14],
  labelV: [14, 0],
};

/** Inductor: four semicircular turns. Pins a (0,0), b (4,0). */
export const inductor: SymbolDef = {
  pins: { a: [0, 0], b: [4, 0] },
  body:
    line(0, 0, 8, 0) +
    path('M8 0 a3 3 0 0 1 6 0 a3 3 0 0 1 6 0 a3 3 0 0 1 6 0 a3 3 0 0 1 6 0') +
    line(32, 0, 40, 0),
  labelH: [20, -8],
  labelV: [8, 0],
};

/** Diode: anode a (0,0), cathode k (4,0). */
export const diode: SymbolDef = {
  pins: { a: [0, 0], k: [4, 0] },
  body: line(0, 0, 13, 0) + path('M13 -7 L13 7 L26 0 Z', 'sf') + line(26, -7, 26, 7) + line(26, 0, 40, 0),
  labelH: [20, -11],
  labelV: [11, 0],
};

/** Schottky diode: bar with hooks. */
export const schottky: SymbolDef = {
  ...diode,
  body:
    line(0, 0, 13, 0) +
    path('M13 -7 L13 7 L26 0 Z', 'sf') +
    path('M29 -4 L29 -7 L26 -7 L26 7 L23 7 L23 4') +
    line(26, 0, 40, 0),
};

/** Switch (normally open), pins a (0,0), b (4,0). */
export const switchNO: SymbolDef = {
  pins: { a: [0, 0], b: [4, 0] },
  body: line(0, 0, 10, 0) + line(10, 0, 29, -10) + line(30, 0, 40, 0),
  labelH: [20, -14],
  labelV: [12, 0],
};

/** Voltage source drawn vertically: + pin p (0,0) at the top, n (0,4) at the bottom. */
function source(inner: string): SymbolDef {
  return {
    pins: { p: [0, 0], n: [0, 4] },
    body: line(0, 0, 0, 10) + `<circle class="sb" cx="0" cy="20" r="10"/>` + line(0, 30, 0, 40) + inner,
    labelH: [14, 20],
    labelV: [14, 20],
  };
}

export const vdc = source(line(-3, 14, 3, 14) + line(0, 11, 0, 17) + line(-3, 26, 3, 26));
export const vac = source(path('M-6 20 q3 -8 6 0 t6 0') + line(-2, 5, 2, 5) + line(0, 3, 0, 7));
export const vpulse = source(path('M-6 24 h4 v-8 h4 v8 h4') + line(-2, 5, 2, 5) + line(0, 3, 0, 7));

/** Ground: pin g (0,0). */
export const ground: SymbolDef = {
  pins: { g: [0, 0] },
  body: line(0, 0, 0, 6) + line(-9, 6, 9, 6) + line(-6, 9, 6, 9) + line(-3, 12, 3, 12),
  labelH: [0, 24],
  labelV: [0, 24],
};

/** Op-amp: in1 (0,−1) top input, in2 (0,1) bottom input, out (6,0). */
function opampSym(topSign: '−' | '+'): SymbolDef {
  const bottom = topSign === '−' ? '+' : '−';
  const sign = (s: string, y: number): string =>
    s === '+' ? line(15, y, 21, y) + line(18, y - 3, 18, y + 3) : line(15, y, 21, y);
  return {
    pins: { in1: [0, -1], in2: [0, 1], out: [6, 0] },
    body:
      line(0, -10, 10, -10) +
      line(0, 10, 10, 10) +
      path('M10 -25 L10 25 L52 0 Z') +
      line(52, 0, 60, 0) +
      sign(topSign, -10) +
      sign(bottom, 10),
    labelH: [24, 34],
    labelV: [24, 34],
    labelAnchor: 'start',
  };
}
export const opamp = opampSym('−');
export const opampFlip = opampSym('+');

/** N-channel enhancement MOSFET: gate g (0,0), drain d (2,−2), source s (2,2). */
export const nmos: SymbolDef = {
  pins: { g: [0, 0], d: [2, -2], s: [2, 2] },
  body:
    line(0, 0, 9, 0) +
    line(9, -9, 9, 9) +
    line(13, -12, 13, -5) +
    line(13, -3, 13, 3) +
    line(13, 5, 13, 12) +
    line(13, -8, 20, -8) +
    line(20, -8, 20, -20) +
    line(13, 8, 20, 8) +
    line(20, 8, 20, 20) +
    line(20, 0, 20, 8) +
    line(14, 0, 20, 0) +
    path('M13 0 L18 -3 L18 3 Z', 'sf'),
  labelH: [26, 0],
  labelV: [26, 0],
};

/** Node dot. */
export const dot: SymbolDef = {
  pins: { c: [0, 0] },
  body: `<circle class="sf" cx="0" cy="0" r="2.6"/>`,
  labelH: [0, -8],
  labelV: [0, -8],
};

/** Open terminal (a small circle), pin c (0,0). */
export const terminal: SymbolDef = {
  pins: { c: [0, 0] },
  body: `<circle class="sb sbg" cx="0" cy="0" r="3"/>`,
  labelH: [0, -9],
  labelV: [0, -9],
};

/**
 * D flip-flop (IEC): 1D at d (0,1), clock C1 at clk (0,4), Q at q (6,1), Q̅ at qn (6,4).
 * The box spans y = 0…5 grid units.
 */
export const dff: SymbolDef = {
  pins: { d: [0, 1], clk: [0, 4], q: [6, 1], qn: [6, 4] },
  body:
    `<rect class="sb" x="10" y="-2" width="40" height="54"/>` +
    line(0, 10, 10, 10) +
    line(0, 40, 10, 40) +
    line(50, 10, 60, 10) +
    line(50, 40, 60, 40) +
    path('M10 35 L16 40 L10 45') +
    `<text class="st" x="14" y="14">1D</text><text class="st" x="19" y="44">C1</text>` +
    `<text class="st" x="46" y="14" text-anchor="end">Q</text><text class="st" x="46" y="44" text-anchor="end">Q̅</text>`,
  labelH: [30, -8],
  labelV: [30, -8],
};

/** Two-input gate (IEC rectangle): a (0,−1), b (0,1), y (5,0). `mark` is "&", "≥1" and so on. */
function gate2(mark: string): SymbolDef {
  return {
    pins: { a: [0, -1], b: [0, 1], y: [5, 0] },
    body:
      `<rect class="sb" x="10" y="-16" width="30" height="32"/>` +
      line(0, -10, 10, -10) +
      line(0, 10, 10, 10) +
      line(40, 0, 50, 0) +
      `<text class="st" x="25" y="4" text-anchor="middle">${mark}</text>`,
    labelH: [25, -20],
    labelV: [25, -20],
  };
}
export const and2 = gate2('&');
export const or2 = gate2('≥1');

/** Inverter (IEC): a (0,0), y (5,0). */
export const inverter: SymbolDef = {
  pins: { a: [0, 0], y: [5, 0] },
  body:
    `<rect class="sb" x="10" y="-12" width="24" height="24"/>` +
    line(0, 0, 10, 0) +
    `<circle class="sb sbg" cx="37" cy="0" r="3"/>` +
    line(40, 0, 50, 0) +
    `<text class="st" x="22" y="4" text-anchor="middle">1</text>`,
  labelH: [22, -16],
  labelV: [22, -16],
};
