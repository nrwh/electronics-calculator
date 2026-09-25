// Exact two-level (sum-of-products) minimisation for up to 4 variables, by prime implicants and an
// exhaustive (branch-and-bound) cover search.

/** A product term: bits in `mask` are the variables that appear; `value` gives their polarity. */
export interface Implicant {
  mask: number;
  value: number;
}

/** Truth-table entry: 0, 1, or don't care. */
export type Tri = 0 | 1 | 'x';

export const covers = (imp: Implicant, m: number): boolean => (m & imp.mask) === imp.value;

export function literalCount(imp: Implicant): number {
  let n = 0;
  for (let b = imp.mask; b; b >>= 1) n += b & 1;
  return n;
}

/** All prime implicants of the function (ones and don't-cares together). */
export function primeImplicants(table: Tri[], nVars: number): Implicant[] {
  const full = (1 << nVars) - 1;
  let current = new Map<string, Implicant>();
  table.forEach((t, m) => {
    if (t !== 0) current.set(`${full}:${m}`, { mask: full, value: m });
  });
  const primes: Implicant[] = [];
  while (current.size) {
    const next = new Map<string, Implicant>();
    const merged = new Set<string>();
    const list = [...current.entries()];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [ka, a] = list[i]!;
        const [kb, b] = list[j]!;
        if (a.mask !== b.mask) continue;
        const diff = a.value ^ b.value;
        if (diff && (diff & (diff - 1)) === 0) {
          const imp = { mask: a.mask & ~diff, value: a.value & ~diff };
          next.set(`${imp.mask}:${imp.value}`, imp);
          merged.add(ka);
          merged.add(kb);
        }
      }
    }
    for (const [k, imp] of current) if (!merged.has(k)) primes.push(imp);
    current = next;
  }
  return primes;
}

/**
 * Minimal sum of products: fewest terms, then fewest literals. Returns [] for the constant 0 and
 * [{ mask: 0, value: 0 }] for the constant 1.
 */
export function minimise(table: Tri[], nVars: number): Implicant[] {
  const ones = table.flatMap((t, m) => (t === 1 ? [m] : []));
  if (!ones.length) return [];
  const primes = primeImplicants(table, nVars);
  // A holder object: TypeScript does not track assignments made inside the recursive closure.
  const found: { best: Implicant[]; cost: [number, number] } = { best: [], cost: [Infinity, Infinity] };
  const cost = (sel: Implicant[]): [number, number] => [
    sel.length,
    sel.reduce((s, p) => s + literalCount(p), 0),
  ];
  const better = (c: [number, number]): boolean =>
    c[0] < found.cost[0] || (c[0] === found.cost[0] && c[1] < found.cost[1]);

  const search = (uncovered: number[], chosen: Implicant[]): void => {
    if (!uncovered.length) {
      const c = cost(chosen);
      if (better(c)) {
        found.best = [...chosen];
        found.cost = c;
      }
      return;
    }
    if (chosen.length + 1 > found.cost[0]) return;
    // Branch on the uncovered minterm with the fewest candidate primes.
    let pick = uncovered[0]!;
    let options = primes.filter((p) => covers(p, pick));
    for (const m of uncovered) {
      const o = primes.filter((p) => covers(p, m));
      if (o.length < options.length) {
        pick = m;
        options = o;
      }
    }
    for (const p of options) {
      search(
        uncovered.filter((m) => !covers(p, m)),
        [...chosen, p],
      );
    }
  };
  search(ones, []);
  return found.best.sort((a, b) => b.mask - a.mask || a.value - b.value);
}

/** Evaluate a sum of products at minterm m. */
export const evaluate = (sop: Implicant[], m: number): 0 | 1 => (sop.some((p) => covers(p, m)) ? 1 : 0);

/**
 * Format a sum of products with variable names, highest bit first, e.g. "Q̅1·Q0 + Q2".
 * `names[i]` is the name of bit i.
 */
export function formatSop(sop: Implicant[], names: string[], bar = '̅'): string {
  if (!sop.length) return '0';
  return sop
    .map((p) => {
      if (p.mask === 0) return '1';
      const lits: string[] = [];
      for (let i = names.length - 1; i >= 0; i--) {
        if (!(p.mask & (1 << i))) continue;
        const name = names[i]!;
        lits.push(p.value & (1 << i) ? name : name[0] + bar + name.slice(1));
      }
      return lits.join('·');
    })
    .join(' + ');
}
