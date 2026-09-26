import { describe, expect, it } from 'vitest';
import { kicad } from '../../src/schematic/kicad';
import { apply, LIB_Y, renderSchematic, SCALE, symbolMatrix, type Pt } from './render';
import { parse, ParseError } from './sexpr';

describe('parse', () => {
  it('reads lists, strings with escapes and numbers', () => {
    const l = parse('(a "x \\"y\\"\\nz" 1.5 -2 bare (b (c)))');
    expect(l.head).toBe('a');
    expect(l.items.slice(0, 4)).toEqual(['x "y"\nz', 1.5, -2, 'bare']);
    expect(l.items[4]).toMatchObject({ head: 'b', start: 28 });
  });

  it('reports the line of an error', () => {
    expect(() => parse('(a\n(b "unterminated\n')).toThrow(ParseError);
    try {
      parse('(a\n\n(b)');
    } catch (e) {
      expect((e as ParseError).line).toBe(1);
    }
  });
});

describe('symbolMatrix', () => {
  // A library point (y up) placed on the sheet (y down).
  const place = (angle: number, mirror: 'x' | 'y' | null, p: Pt): Pt =>
    apply(symbolMatrix(angle, mirror), apply(LIB_Y, p)).map((v) => v + 0) as Pt;

  it('rotates counter-clockwise on screen', () => {
    expect(place(0, null, [1, 0])).toEqual([1, 0]);
    expect(place(0, null, [0, 1])).toEqual([0, -1]); // library up is screen up
    expect(place(90, null, [1, 0])).toEqual([0, -1]);
    expect(place(180, null, [1, 0])).toEqual([-1, 0]);
    expect(place(270, null, [1, 0])).toEqual([0, 1]);
  });

  it('mirrors after rotating (as KiCad does; checked with its ERC)', () => {
    expect(place(0, 'x', [0, 1])).toEqual([0, 1]);
    expect(place(0, 'y', [1, 0])).toEqual([-1, 0]);
    expect(place(90, 'x', [1, 0])).toEqual([0, 1]);
    expect(place(90, 'y', [0, 1])).toEqual([1, 0]);
  });
});

const LIB = `
  (lib_symbols
    (symbol "t:Part"
      (pin_numbers (hide yes))
      (pin_names (offset 0.508))
      (property "Reference" "R" (at 0 0 0) (effects (font (size 1.27 1.27))))
      (symbol "Part_0_1"
        (rectangle (start -1.27 -2.54) (end 1.27 2.54) (stroke (width 0.254)) (fill (type background)))
        (polyline (pts (xy 0 0) (xy 1 0)) (stroke (width 0)) (fill (type none)))
        (arc (start 0 1) (mid 1 0) (end 0 -1) (fill (type none)))
      )
      (symbol "Part_1_1"
        (pin passive line (at 0 3.81 270) (length 1.27) (name "~") (number "1"))
        (pin input clock (at -3.81 0 0) (length 2.54) (name "C1") (number "2"))
      )
    )
  )`;

function sheet(items: string): string {
  return `(kicad_sch (version 20251024) (generator "eeschema") (uuid "u") (paper "A4") ${LIB} ${items} (sheet_instances (path "/" (page "1"))))`;
}

const part = (at: string, props: string, extra = ''): string =>
  `(symbol (lib_id "t:Part") (at ${at}) ${extra} (unit 1) (uuid "s") ${props})`;
const prop = (name: string, value: string, at: string, more = ''): string =>
  `(property "${name}" "${value}" (at ${at}) ${more} (effects (font (size 1.27 1.27)) ${more.includes('justify') ? '' : ''}))`;

describe('renderSchematic', () => {
  it('draws wires, junctions and symbols with pins in the site units', () => {
    const m = renderSchematic(
      sheet(
        `(wire (pts (xy 0 0) (xy 2.54 0)) (uuid "w")) (junction (at 2.54 0) (diameter 0) (uuid "j")) ` +
          part('10.16 10.16 0', prop('Reference', 'R1', '12.7 10.16 0')),
      ),
      'test.kicad_sch',
    );
    const svg = m.parts.join('');
    expect(svg).toContain('<path class="sw" d="M0 0 L10 0"/>');
    expect(svg).toContain('<circle class="sf" cx="10" cy="0" r="2.6"/>');
    // Pin 1 at library (0, 3.81) pointing down: from sheet y = 10.16 − 3.81 to 10.16 − 2.54 mm.
    const y0 = (10.16 - 3.81) * SCALE;
    const y1 = (10.16 - 2.54) * SCALE;
    expect(svg).toContain(`M40 ${Math.round(y0 * 100) / 100} L40 ${Math.round(y1 * 100) / 100}`);
    expect(svg).toContain('class="sb sbg"'); // background fill
    // The arc through library (0, 1), (1, 0), (0, −1): the right half, clockwise on screen.
    expect(svg).toContain('<path class="sb" d="M40 36.06 A3.94 3.94 0 0 1 40 43.94"/>');
    expect(svg).toContain('>C1<'); // pin name
    expect(svg).toContain('>R1<');
    expect(m.vars).toEqual([]);
  });

  it('draws background fills before the lines inside them', () => {
    const svg = renderSchematic(sheet(part('0 0 0', '')), 't').parts.join('');
    expect(svg.indexOf('sb sbg')).toBeLessThan(svg.indexOf('<path class="sb" d="M0 0 L3.94 0"/>'));
  });

  it('turns ${NAME} text into slots, and resolves ${FIELD} from the same symbol', () => {
    const m = renderSchematic(
      sheet(
        part(
          '0 0 0',
          prop('Reference', 'R1', '0 -5 0') +
            prop('Value', '${Sim.Params}', '0 5 0') +
            `(property "Sim.Params" "\${RVAL}" (at 0 0 0) (hide yes) (effects (font (size 1.27 1.27))))`,
        ) + `(text "ESR \${ESR}" (at 20 20 0) (effects (font (size 1.27 1.27)) (justify left)) (uuid "t"))`,
      ),
      't',
    );
    expect(m.vars).toEqual(['ESR', 'RVAL']);
    const slots = m.parts.filter((p) => typeof p !== 'string');
    expect(slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: '${RVAL}', cls: 'sch-val', anchor: 'middle' }),
        expect.objectContaining({
          text: 'ESR ${ESR}',
          cls: 'sch-val',
          anchor: 'start',
          x: Math.round(20 * SCALE * 100) / 100,
        }),
      ]),
    );
  });

  it('skips hidden fields and keeps rotated fields readable', () => {
    const m = renderSchematic(
      sheet(
        part(
          '0 0 90',
          prop('Reference', 'R1', '5 0 90') +
            `(property "Value" "hidden" (at 0 0 0) (hide yes) (effects (font (size 1.27 1.27))))`,
        ),
      ),
      't',
    );
    const svg = m.parts.join('');
    expect(svg).not.toContain('hidden');
    // Field angle 90 on a symbol at 90° reads horizontally.
    expect(svg).toMatch(/<text class="sch-ref"[^>]*text-anchor="middle">R1</);
  });

  it('rejects what it cannot draw, with the file and line', () => {
    expect(() => renderSchematic(sheet('\n(bus (pts (xy 0 0) (xy 1 0)))'), 'a.kicad_sch')).toThrow(
      /a\.kicad_sch:\d+: "bus" is not supported/,
    );
    expect(() => renderSchematic(sheet('(symbol (lib_id "x:Missing") (at 0 0 0))'), 'a.kicad_sch')).toThrow(
      /"x:Missing" is missing from lib_symbols/,
    );
    expect(() => renderSchematic('(kicad_pcb)', 'b')).toThrow(/not a KiCad schematic/);
  });
});

describe('kicad()', () => {
  const model = renderSchematic(
    sheet(`(text "\${A} and \${B}" (at 0 0 0) (effects (font (size 1.27 1.27))) (uuid "t"))`),
    'v.kicad_sch',
  );

  it('fills in and escapes the variables', () => {
    const doc = kicad(model, { title: 'T', desc: 'D', vars: { A: '<1 kΩ>', B: 'V_{out}' } });
    expect(doc.svg).toMatch(
      /^<svg class="schematic" viewBox="[^"]+" role="img" aria-labelledby="sch-title sch-desc"/,
    );
    expect(doc.svg).toContain('&lt;1 kΩ&gt; and V<tspan dy="3" font-size="75%">out</tspan>');
  });

  it('fails on a missing or unknown variable', () => {
    expect(() => kicad(model, { title: '', desc: '', vars: { A: '1' } })).toThrow(
      /v\.kicad_sch: no value given for \$\{B\}/,
    );
    expect(() => kicad(model, { title: '', desc: '', vars: { A: '1', B: '2', C: '3' } })).toThrow(
      /the schematic has no \$\{C\}/,
    );
  });
});
