// Calculator page: reads the id from the pre-rendered page, lazily loads that calculator's chunk,
// and drives the top panel (solve-for, fields, series, schematic), the sticky strip and the tabs.

import 'katex/dist/katex.min.css';
import { loadCalculator } from '../calculators/registry';
import type { AnyCalculatorDef, ResultRow, Settings } from '../calculators/types';
import { findOption, runPipeline, snapPartText, unitOf, type PipelineResult } from '../lib/pipeline';
import { formatInput } from '../lib/units';
import { partTypes, readState, writeState, type CalcState, type TabId } from '../lib/url';
import { bindField, type FieldHandle } from '../ui/field';
import { renderGraphs } from '../ui/graphs-panel';
import { renderGuide } from '../ui/guide-panel';
import { h, replace, sym, $ } from '../ui/h';
import { fieldView, formatValue, messagesHtml, topPanelHtml } from '../ui/markup';
import { renderHeadline, renderResultsTab } from '../ui/results';
import { loadPrefs, renderSettingsBar, savePrefs } from '../ui/settings';
import { initShell } from '../ui/shell';
import { bindSolveControl } from '../ui/solve-control';
import { renderSpice } from '../ui/spice-panel';
import { initTabs, type TabsHandle } from '../ui/tabs';

const DEBOUNCE_MS = 120;

interface Design {
  result: PipelineResult;
  values: Record<string, number | string>;
  out: unknown;
  rows: ResultRow[];
}

class CalculatorPage {
  private state: CalcState;
  private readonly fields = new Map<string, FieldHandle>();
  private design: Design | null = null;
  private last: PipelineResult | null = null;
  private stale = new Set<TabId>();
  private timer = 0;
  private tabs!: TabsHandle;
  private readonly article = $('.calc');
  private readonly solveBox = $('#solve');
  private readonly fieldsBox = $('#fields');
  private readonly headline = $('#headline');
  private readonly messages = $('#messages');
  private readonly schematic = $('#schematic');
  private readonly strip = $('#strip');
  private setSolve: (id: string) => void = () => {};

  constructor(private readonly def: AnyCalculatorDef) {
    this.state = readState(def, location.search, loadPrefs());
  }

  start(): void {
    const def = this.def;
    const st = this.state;
    // The page was pre-rendered with the default design. Render the same markup for this URL's
    // state (the layout is identical, so nothing moves), then bind it.
    const r = runPipeline(def, st.solve, st.raw, st.settings);
    const html = topPanelHtml(def, partTypes(def), st.raw, st.solve, st.settings, r);
    this.solveBox.innerHTML = html.solve;
    this.fieldsBox.innerHTML = html.fields;
    this.setSolve = bindSolveControl(this.solveBox, (id) => this.switchSolve(id)).set;
    for (const el of this.fieldsBox.querySelectorAll<HTMLElement>('.field')) {
      const f = bindField(
        el,
        (k, raw) => this.onInput(k, raw),
        (k) => this.onCommit(k),
      );
      this.fields.set(f.key, f);
    }
    renderSettingsBar($('#settings'), partTypes(def), st.settings, (s) => this.onSettings(s));

    const tabRoot = $('.tabs');
    const initial = st.tab ?? (def.plots ? 'graphs' : 'results');
    this.tabs = initTabs(tabRoot, initial === 'graphs' && !def.plots ? 'results' : initial, (id) =>
      this.onTab(id),
    );
    this.tabs.setAvailable('graphs', Boolean(def.plots));

    this.strip.addEventListener('click', () => {
      $('#top-panel').scrollIntoView({ behavior: 'auto', block: 'start' });
      this.strip.hidden = true;
      (this.fieldsBox.querySelector('input:not([readonly]), select') as HTMLElement | null)?.focus({
        preventScroll: true,
      });
    });
    this.observeTopPanel();
    this.compute();
  }

  // ---------- Events ----------

  private onInput(key: string, raw: string): void {
    this.state.raw[key] = raw;
    // Choices change which fields are shown, so apply them immediately.
    if (this.def.vars[key]?.kind === 'choice') {
      this.compute();
      return;
    }
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.compute(), DEBOUNCE_MS);
  }

  /** A typed part snaps to the selected series once the viewer leaves the field. */
  private onCommit(key: string): void {
    if (this.snapInput(key)) {
      clearTimeout(this.timer);
      this.compute();
    }
  }

  private onSettings(s: Settings): void {
    this.state.settings = s;
    savePrefs(s);
    // Keep typed parts on the (new) series.
    for (const key of this.fields.keys()) this.snapInput(key);
    clearTimeout(this.timer);
    this.compute();
  }

  /** Replace a typed part's text with its nearest series value. True when the text changed. */
  private snapInput(key: string): boolean {
    if (findOption(this.def, this.state.solve).targets.includes(key)) return false;
    const d = this.def.vars[key]!;
    const text = snapPartText(d, this.state.raw[key] ?? d.default, this.state.settings);
    if (text === null) return false;
    this.state.raw[key] = text;
    this.fields.get(key)?.setText(text);
    return true;
  }

  private onTab(id: TabId): void {
    this.state.tab = id;
    if (this.design && this.stale.has(id)) this.renderTab(id);
    this.writeUrl();
  }

  /**
   * Switching the solve option keeps the design continuous: each value just solved (the snapped
   * value, for a part) becomes the input for its field; the new targets are solved.
   */
  private switchSolve(id: string): void {
    if (id === this.state.solve) return;
    clearTimeout(this.timer);
    const r = this.last;
    if (r?.ok) {
      for (const [key, s] of Object.entries(r.solved)) this.state.raw[key] = formatInput(s.value);
    }
    this.state.solve = id;
    this.setSolve(id);
    for (const [key, f] of this.fields) {
      if (f.input instanceof HTMLInputElement && !findOption(this.def, id).targets.includes(key)) {
        f.setText(this.state.raw[key] ?? '');
      }
    }
    this.compute();
  }

  // ---------- Computation ----------

  private compute(): void {
    const def = this.def;
    const st = this.state;
    const r = runPipeline(def, st.solve, st.raw, st.settings);
    this.last = r;
    if (r.ok) {
      const values = r.values!;
      const rows = def.results(values, r.out, st.settings) as ResultRow[];
      this.design = { result: r, values, out: r.out, rows };
      for (const t of ['graphs', 'results', 'components', 'spice'] as TabId[]) this.stale.add(t);
      this.renderDesign();
    }
    this.article.classList.toggle('invalid', !r.ok);
    for (const [key, f] of this.fields) f.apply(fieldView(def, key, st.raw, st.solve, st.settings, r));
    this.messages.innerHTML = messagesHtml(def, r);
    this.writeUrl();
  }

  private renderDesign(): void {
    const d = this.design!;
    renderHeadline(this.headline, this.def, d.result, d.rows);
    this.schematic.innerHTML = this.def.schematic(d.values, d.out).svg;
    this.renderStrip();
    this.renderTab(this.tabs.current());
  }

  private renderTab(id: TabId): void {
    const d = this.design;
    if (!d) return;
    const panel = $(`#panel-${id}`);
    const s = this.state.settings;
    switch (id) {
      case 'graphs':
        renderGraphs(panel, this.def.plots?.(d.values, d.out) ?? []);
        break;
      case 'results':
        renderResultsTab(panel, this.def, d.result, d.rows);
        break;
      case 'components':
        renderGuide(panel, this.def.guide(d.values, d.out, s));
        break;
      case 'spice':
        renderSpice(panel, this.def.spice?.(d.values, d.out));
        break;
      case 'derivation':
        break;
    }
    this.stale.delete(id);
  }

  // ---------- Sticky strip ----------

  private stripVisible = false;

  /** The strip appears once the top panel has scrolled above the top of the screen. */
  private observeTopPanel(): void {
    const io = new IntersectionObserver(([entry]) => {
      this.stripVisible = !entry!.isIntersecting && entry!.boundingClientRect.bottom < 0;
      this.strip.hidden = !this.stripVisible;
    });
    io.observe($('#top-panel'));
  }

  private renderStrip(): void {
    const d = this.design!;
    const bits: Node[] = [];
    for (const [key, s] of Object.entries(d.result.solved)) {
      const v = this.def.vars[key]!;
      bits.push(
        h(
          'span',
          null,
          v.symbol ? sym(v.symbol) : v.label,
          ' = ',
          h('b', null, formatValue(s.value, unitOf(v))),
        ),
      );
    }
    for (const row of d.rows.filter((r) => r.headline)) {
      if (row.achieved && d.result.solved[row.achieved]) continue;
      bits.push(
        h(
          'span',
          null,
          row.symbol ? sym(row.symbol.split(' ')[0]!) : row.label,
          ' = ',
          h('b', null, formatValue(row.value, row.unit, row.sig)),
        ),
      );
    }
    bits.push(h('span', { class: 'strip-hint' }, 'Edit ↑'));
    replace(this.strip, bits);
  }

  // ---------- URL ----------

  private writeUrl(): void {
    const qs = writeState(this.def, this.state);
    if (qs !== location.search) history.replaceState(null, '', qs);
  }
}

async function main(): Promise<void> {
  initShell();
  const id = $('.calc').dataset.calc!;
  try {
    const def = await loadCalculator(id);
    new CalculatorPage(def).start();
  } catch (e) {
    console.error(e);
    replace(
      $('#messages'),
      h(
        'div',
        { class: 'msg error', role: 'alert' },
        'The calculator failed to load. Reload the page to try again.',
      ),
    );
  }
}

void main();
