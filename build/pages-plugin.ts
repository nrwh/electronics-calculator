// Emits index.html, about/, 404.html and calc/<id>/ from each calculator's meta.ts, and serves
// the same pages from the dev server. There is no client router: pages are ordinary files.

import fs from 'node:fs';
import path from 'node:path';
import { normalizePath, runnerImport, type Plugin } from 'vite';
import type { AnyCalculatorDef, CalculatorMeta } from '../src/calculators/types';
import type { TopPanel } from '../src/ui/markup';
import { renderDerivation } from './derivation-plugin';
import { renderAbout, renderCalculator, renderHome, renderNotFound, type SiteContext } from './site';

type PageKey = { kind: 'home' } | { kind: 'about' } | { kind: 'notFound' } | { kind: 'calc'; id: string };

const CALC_DIR = 'src/calculators';

/** Calculator folders: every directory with a meta.ts, except ones starting with "_" (the template). */
export function listCalculatorIds(root: string): string[] {
  const dir = path.join(root, CALC_DIR);
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(
      (d) => d.isDirectory() && !d.name.startsWith('_') && fs.existsSync(path.join(dir, d.name, 'meta.ts')),
    )
    .map((d) => d.name)
    .sort();
}

export async function loadMeta(root: string, id: string): Promise<CalculatorMeta> {
  const file = path.join(root, CALC_DIR, id, 'meta.ts');
  const { module } = await runnerImport<{ default: CalculatorMeta }>(file, {
    configFile: false,
    root,
    logLevel: 'silent',
  });
  const meta = module.default;
  if (meta.id !== id) throw new Error(`${file}: id "${meta.id}" must match the folder name "${id}"`);
  return meta;
}

/** Render a calculator's default design (top panel) for its pre-rendered page. */
export async function prerenderCalculator(root: string, id: string): Promise<TopPanel> {
  const opts = { configFile: false as const, root, logLevel: 'silent' as const };
  const [{ module: calc }, { module: pre }] = await Promise.all([
    runnerImport<{ default: AnyCalculatorDef }>(path.join(root, CALC_DIR, id, 'index.ts'), opts),
    runnerImport<{ prerender: (def: AnyCalculatorDef) => TopPanel }>(
      path.join(root, 'src/ui/prerender.ts'),
      opts,
    ),
  ]);
  return pre.prerender(calc.default);
}

export async function loadMetas(root: string): Promise<CalculatorMeta[]> {
  const metas = await Promise.all(listCalculatorIds(root).map((id) => loadMeta(root, id)));
  const order = ['filters', 'power', 'opamp', 'oscillators', 'digital'];
  return metas.sort(
    (a, b) => order.indexOf(a.category) - order.indexOf(b.category) || a.title.localeCompare(b.title),
  );
}

function htmlPathFor(root: string, key: PageKey): string {
  switch (key.kind) {
    case 'home':
      return normalizePath(path.join(root, 'index.html'));
    case 'about':
      return normalizePath(path.join(root, 'about/index.html'));
    case 'notFound':
      return normalizePath(path.join(root, '404.html'));
    case 'calc':
      return normalizePath(path.join(root, 'calc', key.id, 'index.html'));
  }
}

export function pagesPlugin(opts: { siteUrl: string }): Plugin {
  let root = process.cwd();
  let base = '/';
  const byPath = new Map<string, PageKey>();

  const ctx = (): SiteContext => ({ base, siteUrl: opts.siteUrl });

  function registerPages(): Record<string, string> {
    byPath.clear();
    const keys: PageKey[] = [
      { kind: 'home' },
      { kind: 'about' },
      { kind: 'notFound' },
      ...listCalculatorIds(root).map((id): PageKey => ({ kind: 'calc', id })),
    ];
    const input: Record<string, string> = {};
    for (const k of keys) {
      const p = htmlPathFor(root, k);
      byPath.set(p, k);
      input[k.kind === 'calc' ? `calc/${k.id}` : k.kind] = p;
    }
    return input;
  }

  async function render(key: PageKey): Promise<string> {
    switch (key.kind) {
      case 'home': {
        const metas = await loadMetas(root);
        const tops = await Promise.all(metas.map((m) => prerenderCalculator(root, m.id)));
        const schematics = Object.fromEntries(metas.map((m, i) => [m.id, tops[i]!.schematic]));
        return renderHome(ctx(), metas, schematics);
      }
      case 'about':
        return renderAbout(ctx());
      case 'notFound':
        return renderNotFound(ctx());
      case 'calc': {
        const meta = await loadMeta(root, key.id);
        const mdFile = path.join(root, CALC_DIR, key.id, 'derivation.md');
        const md = fs.existsSync(mdFile) ? fs.readFileSync(mdFile, 'utf8') : '*No derivation yet.*';
        return renderCalculator(
          ctx(),
          meta,
          renderDerivation(md, mdFile),
          await prerenderCalculator(root, key.id),
        );
      }
    }
  }

  /** Map a request path (with the base already removed) to a page. */
  function route(p: string): PageKey | 'redirect' | null {
    if (p === '/' || p === '/index.html') return { kind: 'home' };
    if (p === '/about/' || p === '/about/index.html') return { kind: 'about' };
    if (p === '/404.html') return { kind: 'notFound' };
    const m = /^\/calc\/([a-z0-9-]+)(\/|\/index\.html)?$/.exec(p);
    if (m && listCalculatorIds(root).includes(m[1]!)) return m[2] ? { kind: 'calc', id: m[1]! } : 'redirect';
    if (p === '/about') return 'redirect';
    return null;
  }

  return {
    name: 'ec-pages',
    enforce: 'pre',
    config(userConfig) {
      root = normalizePath(path.resolve(userConfig.root ?? process.cwd()));
      return { build: { rollupOptions: { input: registerPages() } } };
    },
    configResolved(config) {
      root = normalizePath(config.root);
      base = config.base;
      registerPages();
    },
    resolveId(id) {
      const p = normalizePath(id);
      if (byPath.has(p)) return p;
      return null;
    },
    async load(id) {
      const key = byPath.get(normalizePath(id));
      return key ? render(key) : null;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        try {
          const url = new URL(req.url ?? '/', 'http://localhost');
          let p = url.pathname;
          if (base !== '/' && p.startsWith(base)) p = '/' + p.slice(base.length);
          else if (base !== '/' && p + '/' === base) p = '/';
          const key = route(p);
          if (key === 'redirect') {
            res.statusCode = 301;
            res.setHeader('Location', `${base}${p.slice(1)}/${url.search}`);
            return res.end();
          }
          if (!key) return next();
          const html = await server.transformIndexHtml(req.url ?? '/', await render(key));
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(html);
        } catch (e) {
          next(e);
        }
      });
      server.watcher.on('all', (_event, file) => {
        if (/[\\/]calculators[\\/][^\\/]+[\\/]meta\.ts$/.test(file)) server.ws.send({ type: 'full-reload' });
      });
    },
  };
}
