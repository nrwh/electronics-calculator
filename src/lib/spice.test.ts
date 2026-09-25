import { describe, expect, it } from 'vitest';
import { Netlist, isUnavailable, pulse, spiceValue, unavailable } from './spice';

describe('spiceValue', () => {
  it('writes mega as Meg, never M (SPICE reads M as milli)', () => {
    expect(spiceValue(1e6)).toBe('1Meg');
    expect(spiceValue(2.2e6)).toBe('2.2Meg');
    expect(spiceValue(10e6)).toBe('10Meg');
    expect(spiceValue(0.001)).toBe('1m');
    for (const x of [1e6, 3.3e6, 470e6]) expect(spiceValue(x)).not.toMatch(/\dM$/);
  });

  it.each([
    [4700, '4.7k'],
    [4.7e-9, '4.7n'],
    [100e-12, '100p'],
    [2.2e-6, '2.2u'],
    [1.5e-3, '1.5m'],
    [1, '1'],
    [0, '0'],
    [-5, '-5'],
    [1e9, '1G'],
    [1.23456789e3, '1.23457k'],
    [1e-16, '1e-16'],
  ])('%s → %s', (x, s) => {
    expect(spiceValue(x)).toBe(s);
  });

  it('refuses non-finite values', () => {
    expect(() => spiceValue(NaN)).toThrow();
  });
});

describe('Netlist', () => {
  it('builds sections in order', () => {
    const n = new Netlist('Test circuit');
    n.comment('a note');
    n.add('R1', ['in', 'out'], 10e3);
    n.add('V1', ['in', '0'], 'DC 0 AC 1', pulse(0, 1, 0, 1e-9, 1e-9, 1e-3, 2e-3));
    n.model('DX', 'D', { Is: 1e-14, N: 1 });
    n.analysis('.ac dec 10 1 1Meg');
    expect(n.toString()).toMatchInlineSnapshot(`
      "* Test circuit
      * a note

      R1 in out 10k
      V1 in 0 DC 0 AC 1 PULSE(0 1 0 1n 1n 1m 2m)

      .model DX D(Is=10f N=1)

      .ac dec 10 1 1Meg
      .end
      "
    `);
    expect(n.fileName).toBe('test-circuit');
  });

  it('inserts extra lines before .end', () => {
    const n = new Netlist('x');
    expect(n.toString(['.control', 'run', '.endc'])).toMatch(/\.endc\n\.end\n$/);
  });

  it('marks unavailable netlists', () => {
    expect(isUnavailable(unavailable('no'))).toBe(true);
    expect(isUnavailable(new Netlist('x'))).toBe(false);
  });
});
