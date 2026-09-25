// Home-page filter: rank calculators by simple token matching.
// Exact > prefix > substring, with the title weighted above keywords.

export interface FilterEntry {
  title: string;
  keywords: string[];
  summary: string;
  category: string;
  categoryLabel: string;
}

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9µ]+/)
    .filter(Boolean);
}

function best(token: string, words: string[], exact: number, prefix: number, sub: number): number {
  let s = 0;
  for (const w of words) {
    if (w === token) return exact;
    if (w.startsWith(token)) s = Math.max(s, prefix);
    else if (w.includes(token)) s = Math.max(s, sub);
  }
  return s;
}

/** Score an entry for a query; null when some query token matches nothing. Empty query scores 0. */
export function score(e: FilterEntry, query: string): number | null {
  const tokens = tokenize(query);
  if (!tokens.length) return 0;
  const title = tokenize(e.title);
  const keywords = e.keywords.flatMap(tokenize);
  // Multi-word keywords also match as a phrase ("low pass").
  const phrases = e.keywords.map((k) => k.toLowerCase());
  const summary = tokenize(e.summary);
  const cat = tokenize(e.categoryLabel).concat(tokenize(e.category));
  let total = 0;
  for (const t of tokens) {
    const s = Math.max(
      best(t, title, 30, 20, 10),
      best(t, keywords, 15, 10, 5),
      best(t, cat, 8, 6, 0),
      best(t, summary, 3, 2, 0),
    );
    if (s === 0) return null;
    total += s;
  }
  const q = query.trim().toLowerCase();
  if (tokens.length > 1 && phrases.some((p) => p === q)) total += 20;
  return total;
}

/** Indices of matching entries, best first; ties keep their original order. */
export function rank(entries: FilterEntry[], query: string, category = ''): number[] {
  return entries
    .map((e, i) => ({ i, s: category && e.category !== category ? null : score(e, query) }))
    .filter((x): x is { i: number; s: number } => x.s !== null)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.i);
}
