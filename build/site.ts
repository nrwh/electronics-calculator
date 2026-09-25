// Pre-rendered HTML for every page: home, about, 404 and one page per calculator.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CalculatorMeta, Category } from '../src/calculators/types';
import type { TopPanel } from '../src/ui/markup';
import { CATEGORY_LABELS } from '../src/calculators/types';

const here = path.dirname(fileURLToPath(import.meta.url));

export const REPO_URL = 'https://github.com/nrwh/electronics-calculator';
export const SITE_NAME = 'Electronics Calculator';

export interface SiteContext {
  base: string;
  /** Absolute site URL including the base path, e.g. https://nrwh.github.io/electronics-calculator/ */
  siteUrl: string;
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let template: string | null = null;

function page(
  ctx: SiteContext,
  p: {
    title: string;
    ogTitle?: string;
    description: string;
    urlPath: string;
    script: string;
    bodyClass: string;
    main: string;
    nav?: 'home' | 'about';
  },
): string {
  template ??= fs.readFileSync(path.join(here, 'templates/page.html'), 'utf8');
  const vals: Record<string, string> = {
    title: esc(p.title),
    ogTitle: esc(p.ogTitle ?? p.title),
    description: esc(p.description),
    url: esc(ctx.siteUrl + p.urlPath),
    script: p.script,
    bodyClass: p.bodyClass,
    base: ctx.base,
    repo: REPO_URL,
    navHome: p.nav === 'home' ? ' aria-current="page"' : '',
    navAbout: p.nav === 'about' ? ' aria-current="page"' : '',
    main: p.main,
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    if (!(k in vals)) throw new Error(`Unknown template key ${k}`);
    return vals[k]!;
  });
}

export function renderHome(ctx: SiteContext, metas: CalculatorMeta[]): string {
  const cats = Object.entries(CATEGORY_LABELS) as [Category, string][];
  const cards = metas
    .map(
      (m) => `
      <li class="card" data-id="${esc(m.id)}" data-title="${esc(m.title)}" data-category="${m.category}" data-keywords="${esc(m.keywords.join('|'))}" data-summary="${esc(m.summary)}">
        <a href="${ctx.base}calc/${m.id}/">
          <h2>${esc(m.title)}</h2>
          <p>${esc(m.summary)}</p>
          <span class="card-cat">${esc(CATEGORY_LABELS[m.category])}</span>
        </a>
      </li>`,
    )
    .join('');
  const main = `
    <section class="home">
      <h1>Electronics design calculators</h1>
      <p class="lede">Each calculator gives you a schematic, standard (E-series) part values, a component guide, graphs, the derivation of its formulas and a SPICE netlist.</p>
      <div class="filter needs-js" role="search">
        <label for="q">Filter calculators</label>
        <input id="q" type="search" placeholder="e.g. filter, buck, wien, counter" autocomplete="off" spellcheck="false" />
      </div>
      <div class="chips needs-js" role="group" aria-label="Category">
        <button type="button" class="chip" data-cat="" aria-pressed="true">All</button>
        ${cats.map(([k, label]) => `<button type="button" class="chip" data-cat="${k}" aria-pressed="false">${esc(label)}</button>`).join('')}
      </div>
      <p class="filter-status" id="filter-status" role="status"></p>
      <ul class="cards" id="cards">${cards}</ul>
    </section>`;
  return page(ctx, {
    title: `${SITE_NAME}: design calculators with schematics and SPICE`,
    ogTitle: SITE_NAME,
    description:
      'Free electronics design calculators: RC filters, buck converters, op-amp differentiators, Wien bridge oscillators and digital counters, with E-series parts, graphs, derivations and SPICE netlists.',
    urlPath: '',
    script: '/src/pages/home.ts',
    bodyClass: 'page-home',
    main,
    nav: 'home',
  });
}

export const TAB_LABELS = [
  ['graphs', 'Graphs'],
  ['results', 'Results'],
  ['components', 'Components'],
  ['derivation', 'Derivation'],
  ['spice', 'SPICE'],
] as const;

export function renderCalculator(
  ctx: SiteContext,
  meta: CalculatorMeta,
  derivationHtml: string,
  top: TopPanel,
): string {
  const tabs = TAB_LABELS.map(
    ([id, label]) =>
      `<button type="button" role="tab" id="tab-${id}" aria-controls="panel-${id}" aria-selected="false" tabindex="-1">${label}</button>`,
  ).join('');
  const panels = TAB_LABELS.map(([id, label]) => {
    const body =
      id === 'derivation'
        ? `<h2 class="panel-title">Derivation</h2><div class="derivation">${derivationHtml}</div>`
        : `<h2 class="panel-title">${label}</h2>`;
    return `<section role="tabpanel" class="panel" id="panel-${id}" aria-labelledby="tab-${id}" tabindex="0"${id === 'derivation' ? '' : ' hidden'}>${body}</section>`;
  }).join('');
  const main = `
    <article class="calc" data-calc="${esc(meta.id)}">
      <div class="calc-head">
        <div class="calc-title">
          <h1>${esc(meta.title)}</h1>
          <p class="summary">${esc(meta.summary)}</p>
        </div>
        <div class="settings-bar needs-js" id="settings" role="group" aria-label="Component series and tolerance">${top.settings}</div>
      </div>
      <noscript><p class="noscript">The calculator needs JavaScript. The derivation below works without it.</p></noscript>
      <section class="top-panel needs-js" id="top-panel" aria-label="Design">
        <div class="top-left" id="top-left">
          <div id="solve">${top.solve}</div>
          <div id="fields" class="fields">${top.fields}</div>
          <div id="headline" class="headline" aria-live="polite">${top.headline}</div>
          <div id="messages" class="messages">${top.messages}</div>
        </div>
        <figure class="top-right" id="schematic">${top.schematic}</figure>
      </section>
      <button type="button" class="strip" id="strip" hidden aria-label="Back to the inputs"></button>
      <section class="tabs" aria-label="Details">
        <div class="tablist needs-js" role="tablist" aria-label="Details">${tabs}</div>
        <div class="panels">${panels}</div>
      </section>
    </article>`;
  return page(ctx, {
    title: `${meta.title} calculator | ${SITE_NAME}`,
    ogTitle: `${meta.title} calculator`,
    description: meta.summary,
    urlPath: `calc/${meta.id}/`,
    script: '/src/pages/calculator.ts',
    bodyClass: 'page-calc',
    main,
  });
}

export function renderAbout(ctx: SiteContext, metas: CalculatorMeta[]): string {
  const main = `
    <article class="prose about">
      <h1>About</h1>
      <p>${SITE_NAME} is a set of electronics design calculators. Each one works out component values, snaps them to standard E-series values, shows what the chosen parts actually achieve (including the spread across part tolerances), and gives a schematic, graphs, a component selection guide, the derivation of every formula and a SPICE netlist you can simulate.</p>

      <h2>Calculators</h2>
      <ul>${metas.map((m) => `<li><a href="${ctx.base}calc/${m.id}/">${esc(m.title)}</a>: ${esc(m.summary)}</li>`).join('')}</ul>

      <h2>Assumptions</h2>
      <ul>
        <li>Parts are ideal unless a calculator says otherwise: no parasitic capacitance or inductance, no capacitor leakage, and no resistor self-heating.</li>
        <li>Op-amps are modelled as a single pole: DC gain, gain-bandwidth product (GBW), slew rate and output limits. Real parts have more poles, input capacitance and output impedance that can matter near GBW.</li>
        <li>The buck converter uses the usual steady-state, continuous-conduction formulas and a lumped efficiency estimate.</li>
        <li>Logic timing uses typical datasheet maximums at 25 °C for each family. Check the datasheet for your part and temperature range.</li>
        <li>The tolerance spread varies every part between its ± limits (all 2<sup>n</sup> corners, up to six parts). It does not include temperature coefficients, ageing or DC-bias derating.</li>
      </ul>

      <h2>Number entry</h2>
      <p>Fields accept SI prefixes: <code>4k7</code> = 4.7 k, <code>100n</code>, <code>2.2u</code> or <code>2.2µ</code>, <code>1M</code> = mega, <code>1m</code> = milli, and <code>1meg</code> = mega. For resistors, <code>4R7</code> = 4.7 Ω.</p>

      <h2>SPICE compatibility</h2>
      <p>Netlists target <a href="https://ngspice.sourceforge.io/">ngspice</a>, and every calculator's netlists are simulated in continuous integration: the measured cut-off frequency, gain, oscillation frequency, output voltage and ripple, and count sequence must match the calculator before the site deploys.</p>
      <p>Analogue netlists use only a subset that ngspice and LTspice both accept: R, C, L, D and S elements with <code>.model</code>, E and V sources, <code>.ac</code>, <code>.tran</code> with <code>uic</code>, and instance <code>IC=</code>. They use no behavioural (B) sources and no <code>.meas</code> statements. Op-amps use a shared generic subcircuit (gain stage, one pole, output clamps and a buffer), so no vendor models are needed.</p>
      <ul>
        <li>ngspice runs every analysis in a netlist. LTspice runs one analysis per simulation, so comment out the <code>.ac</code> or <code>.tran</code> line you don't need.</li>
        <li>SPICE is case-insensitive, so <code>M</code> means milli. Netlists always write <code>Meg</code> for 10<sup>6</sup>.</li>
        <li>The digital counter netlist uses ngspice's XSPICE digital models (<code>d_dff</code>, <code>d_and</code>, <code>d_or</code>, <code>d_inverter</code>) and runs in ngspice only.</li>
        <li>LTspice compatibility is checked by hand before each major release.</li>
      </ul>

      <h2>Disclaimer</h2>
      <p>The results are design estimates, not guarantees. Check component datasheets, derate for temperature and voltage, and test your circuit, especially anything connected to mains, batteries or other high-energy sources. The software is provided "as is", without warranty of any kind.</p>

      <h2>Licence and source</h2>
      <p>Released under the MIT licence. Source, issues and contributions: <a href="${REPO_URL}">${REPO_URL.replace('https://', '')}</a>. Adding a calculator is a one-folder job; see <a href="${REPO_URL}/blob/main/CONTRIBUTING.md">CONTRIBUTING.md</a>.</p>
    </article>`;
  return page(ctx, {
    title: `About | ${SITE_NAME}`,
    description: `Assumptions, SPICE compatibility notes, disclaimer and licence for ${SITE_NAME}.`,
    urlPath: 'about/',
    script: '/src/pages/about.ts',
    bodyClass: 'page-about',
    main,
    nav: 'about',
  });
}

export function renderNotFound(ctx: SiteContext): string {
  const main = `
    <article class="prose">
      <h1>Page not found</h1>
      <p>That page doesn't exist. <a href="${ctx.base}">Browse all calculators</a>.</p>
    </article>`;
  return page(ctx, {
    title: `Page not found | ${SITE_NAME}`,
    description: 'Page not found.',
    urlPath: '404.html',
    script: '/src/pages/about.ts',
    bodyClass: 'page-404',
    main,
  });
}
