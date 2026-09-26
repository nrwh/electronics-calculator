// S-expression reader for KiCad files (.kicad_sch, .kicad_sym). Quoted strings and bare words
// both read as strings; numbers read as numbers.

export type SAtom = string | number;
/** A list: its head (the keyword, e.g. "wire") and its items, with the line it started on. */
export interface SList {
  head: string;
  items: SExpr[];
  line: number;
  /** Offsets of the list's "(" and one past its ")" in the source text. */
  start: number;
  end: number;
}
export type SExpr = SAtom | SList;

export class ParseError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(`line ${line}: ${message}`);
  }
}

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

export function parse(text: string): SList {
  let i = 0;
  let line = 1;
  const n = text.length;

  const skip = (): void => {
    while (i < n) {
      const c = text[i]!;
      if (c === '\n') line++;
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') i++;
      else break;
    }
  };

  const readString = (): string => {
    const start = line;
    i++; // opening quote
    let out = '';
    while (i < n) {
      const c = text[i]!;
      if (c === '"') {
        i++;
        return out;
      }
      if (c === '\\') {
        const e = text[i + 1];
        out += e === 'n' ? '\n' : e === 't' ? '\t' : (e ?? '');
        i += 2;
        continue;
      }
      if (c === '\n') line++;
      out += c;
      i++;
    }
    throw new ParseError('unterminated string', start);
  };

  const readAtom = (): SAtom => {
    const s = i;
    while (i < n && !/[\s()"]/.test(text[i]!)) i++;
    const tok = text.slice(s, i);
    return NUMBER.test(tok) ? Number(tok) : tok;
  };

  const readList = (): SList => {
    const start = line;
    const from = i;
    i++; // (
    skip();
    if (text[i] === '(' || text[i] === ')' || text[i] === '"')
      throw new ParseError('list must start with a keyword', start);
    const head = String(readAtom());
    const items: SExpr[] = [];
    for (;;) {
      skip();
      if (i >= n) throw new ParseError(`unclosed (${head}`, start);
      const c = text[i];
      if (c === ')') {
        i++;
        return { head, items, line: start, start: from, end: i };
      }
      if (c === '(') items.push(readList());
      else if (c === '"') items.push(readString());
      else items.push(readAtom());
    }
  };

  skip();
  if (text[i] !== '(') throw new ParseError('expected (', line);
  const root = readList();
  skip();
  if (i < n) throw new ParseError('unexpected text after the top-level list', line);
  return root;
}

// ---------- Queries ----------

export const isList = (e: SExpr | undefined, head?: string): e is SList =>
  typeof e === 'object' && e !== null && (head === undefined || e.head === head);

/** All child lists with this head. */
export function all(l: SList, head: string): SList[] {
  return l.items.filter((e): e is SList => isList(e, head));
}

/** The first child list with this head. */
export function one(l: SList, head: string): SList | undefined {
  return l.items.find((e): e is SList => isList(e, head));
}

/** The atoms of a list (its non-list items). */
export function atoms(l: SList): SAtom[] {
  return l.items.filter((e): e is SAtom => !isList(e));
}

export function num(l: SList | undefined, i = 0, fallback = 0): number {
  const v = l ? atoms(l)[i] : undefined;
  return typeof v === 'number' ? v : fallback;
}

export function str(l: SList | undefined, i = 0): string | undefined {
  const v = l ? atoms(l)[i] : undefined;
  return v === undefined ? undefined : String(v);
}

/** KiCad flags: `(hide yes)`, or the older bare `hide` atom. */
export function flag(l: SList | undefined, name: string): boolean {
  if (!l) return false;
  const f = one(l, name);
  if (f) return str(f) !== 'no';
  return atoms(l).includes(name);
}
