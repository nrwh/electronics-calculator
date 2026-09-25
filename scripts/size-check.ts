// Performance budget (run after `npm run build`):
//  - JS loaded up front by each page (entry script + modulepreloads) ≤ 30 kB gzipped
//  - each lazily loaded chunk (one per calculator) ≤ 20 kB gzipped

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const PAGE_BUDGET = 30 * 1024;
const CHUNK_BUDGET = 20 * 1024;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}

const gz = (file: string): number => gzipSync(fs.readFileSync(file), { level: 9 }).length;
const kb = (n: number): string => `${(n / 1024).toFixed(1)} kB`;

if (!fs.existsSync(dist)) {
  console.error('dist/ not found; run `npm run build` first.');
  process.exit(1);
}

const files = walk(dist);
const base = (process.env.BASE_PATH ?? '/electronics-calculator/').replace(/\/?$/, '/');
const toFile = (url: string): string =>
  path.join(dist, url.startsWith(base) ? url.slice(base.length) : url.replace(/^\//, ''));
const referenced = new Set<string>();
let failed = false;

for (const html of files.filter((f) => f.endsWith('.html'))) {
  const text = fs.readFileSync(html, 'utf8');
  const urls = [
    ...text.matchAll(/<(?:script[^>]*\ssrc|link[^>]*rel="modulepreload"[^>]*\shref)="([^"]+\.js)"/g),
  ].map((m) => m[1]!);
  const js = urls.map(toFile);
  js.forEach((f) => referenced.add(path.resolve(f)));
  const total = js.reduce((s, f) => s + gz(f), 0);
  const ok = total <= PAGE_BUDGET;
  failed ||= !ok;
  console.log(
    `${ok ? 'ok  ' : 'OVER'}  page ${path.relative(dist, html).replace(/\\/g, '/')}: ${kb(total)} JS (budget ${kb(PAGE_BUDGET)})`,
  );
}

for (const f of files.filter((x) => x.endsWith('.js') && !referenced.has(path.resolve(x)))) {
  const size = gz(f);
  const ok = size <= CHUNK_BUDGET;
  failed ||= !ok;
  console.log(
    `${ok ? 'ok  ' : 'OVER'}  chunk ${path.relative(dist, f).replace(/\\/g, '/')}: ${kb(size)} (budget ${kb(CHUNK_BUDGET)})`,
  );
}

process.exit(failed ? 1 : 0);
