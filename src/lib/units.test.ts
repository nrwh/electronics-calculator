import { describe, expect, it } from 'vitest';
import { formatInput, formatNum, formatPercent, formatSI, parseSI } from './units';

describe('parseSI', () => {
  it.each([
    ['100', 100],
    ['4k7', 4700],
    ['4K7', 4700],
    ['100n', 100e-9],
    ['2.2µ', 2.2e-6],
    ['2.2μ', 2.2e-6],
    ['2.2u', 2.2e-6],
    ['2u2', 2.2e-6],
    ['1M', 1e6],
    ['1m', 1e-3],
    ['1meg', 1e6],
    ['1Meg', 1e6],
    ['1MEG', 1e6],
    ['2meg2', 2.2e6],
    ['1G', 1e9],
    ['10p', 10e-12],
    ['1f', 1e-15],
    ['1.5e3', 1500],
    ['1.5E-3', 0.0015],
    ['.5', 0.5],
    ['-3.3', -3.3],
    [' 47 k ', 47000],
    ['1,000', 1000],
  ])('%s → %s', (text, value) => {
    expect(parseSI(text)).toBeCloseTo(value, 12 - Math.floor(Math.log10(Math.abs(value))));
  });

  it('accepts a trailing unit', () => {
    expect(parseSI('10kHz', 'Hz')).toBe(10e3);
    expect(parseSI('4.7nF', 'F')).toBeCloseTo(4.7e-9, 20);
    expect(parseSI('4.7nf', 'F')).toBeCloseTo(4.7e-9, 20);
    expect(parseSI('1F', 'F')).toBe(1);
    expect(parseSI('10kΩ', 'Ω')).toBe(10e3);
    expect(parseSI('10k ohm', 'Ω')).toBe(10e3);
    expect(parseSI('3.3V', 'V')).toBe(3.3);
    expect(parseSI('1MHz', 'Hz')).toBe(1e6);
    expect(parseSI('1mHz', 'Hz')).toBe(1e-3);
  });

  it('reads "f" alone as femto, even in a farad field', () => {
    expect(parseSI('1f', 'F')).toBe(1e-15);
  });

  it('accepts R as the decimal marker for resistances only', () => {
    expect(parseSI('4R7', 'Ω')).toBeCloseTo(4.7, 12);
    expect(parseSI('10R', 'Ω')).toBe(10);
    expect(parseSI('4R7', 'Hz')).toBeNull();
  });

  it.each(['', 'abc', 'k', '1x', '4.5k7', '1e3k7', '1..2', '1kk'])('rejects %j', (text) => {
    expect(parseSI(text, 'Hz')).toBeNull();
  });
});

describe('formatSI', () => {
  it.each([
    [15915.494, 'Ω', '15.92 kΩ'],
    [1e6, 'Hz', '1 MHz'],
    [0.001, 'H', '1 mH'],
    [4.7e-9, 'F', '4.7 nF'],
    [2.2e-6, 'F', '2.2 µF'],
    [999.96, 'Hz', '1 kHz'],
    [0, 'V', '0 V'],
    [-0.0123, 'A', '−12.3 mA'],
    [12, '', '12'],
  ])('%s %s → %s', (x, unit, text) => {
    expect(formatSI(x, unit)).toBe(text);
  });
});

describe('formatInput', () => {
  it('round-trips through parseSI', () => {
    for (const x of [4700, 16e3, 4.7e-9, 2.2e-6, 1e6, 0.001, 994.7183, 123456.789, 1.5]) {
      expect(Math.abs(parseSI(formatInput(x))! / x - 1)).toBeLessThan(1e-5);
    }
  });
  it('writes micro as u and mega as M', () => {
    expect(formatInput(2.2e-6)).toBe('2.2u');
    expect(formatInput(1e6)).toBe('1M');
  });
});

describe('formatNum and formatPercent', () => {
  it('formats plain numbers', () => {
    expect(formatNum(-3.0103)).toBe('−3.01');
    expect(formatNum(12.345, 3)).toBe('12.3');
    expect(formatNum(0)).toBe('0');
  });
  it('formats signed percentages', () => {
    expect(formatPercent(0.0053)).toBe('+0.53 %');
    expect(formatPercent(-0.0053)).toBe('−0.53 %');
    expect(formatPercent(0)).toBe('0 %');
  });
});
