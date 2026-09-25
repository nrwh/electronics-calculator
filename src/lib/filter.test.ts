import { describe, expect, it } from 'vitest';
import { rank, score, tokenize, type FilterEntry } from './filter';

const entries: FilterEntry[] = [
  {
    title: 'RC low-pass filter',
    keywords: ['lpf', 'low pass', 'cutoff'],
    summary: 'First-order filter',
    category: 'filters',
    categoryLabel: 'Filters',
  },
  {
    title: 'Buck converter',
    keywords: ['step-down', 'smps', 'dc-dc'],
    summary: 'Switching regulator',
    category: 'power',
    categoryLabel: 'Power',
  },
  {
    title: 'Wien bridge oscillator',
    keywords: ['wein', 'sine'],
    summary: 'Sine oscillator with an op-amp',
    category: 'oscillators',
    categoryLabel: 'Oscillators',
  },
  {
    title: 'Analog differentiator',
    keywords: ['op-amp', 'derivative'],
    summary: 'Op-amp differentiator',
    category: 'opamp',
    categoryLabel: 'Op-amp circuits',
  },
];

describe('filter', () => {
  it('tokenizes', () => {
    expect(tokenize('RC Low-pass  filter')).toEqual(['rc', 'low', 'pass', 'filter']);
  });

  it('matches every entry for an empty query', () => {
    expect(rank(entries, '')).toEqual([0, 1, 2, 3]);
  });

  it('ranks exact > prefix > substring and title > keyword', () => {
    expect(score(entries[1]!, 'buck')).toBeGreaterThan(score(entries[1]!, 'buc')!);
    expect(score(entries[1]!, 'buc')).toBeGreaterThan(score(entries[1]!, 'uck')!);
    expect(score(entries[1]!, 'buck')).toBeGreaterThan(score(entries[1]!, 'smps')!);
  });

  it('finds misspellings through keywords', () => {
    expect(rank(entries, 'wein')).toEqual([2]);
  });

  it('requires every token to match', () => {
    expect(rank(entries, 'rc buck')).toEqual([]);
    expect(rank(entries, 'low pass')).toEqual([0]);
  });

  it('filters by category', () => {
    expect(rank(entries, '', 'power')).toEqual([1]);
    expect(rank(entries, 'filter', 'power')).toEqual([]);
  });

  it('puts the best match first', () => {
    expect(rank(entries, 'op')[0]).toBe(3);
  });
});
