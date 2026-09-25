# Electronics Calculator — Project Plan

## Context
The repo `nrwh/electronics-calculator` is empty apart from the README. The goal is a fast static site on GitHub Pages that hosts electronics design calculators. Each calculator gives more than a number: it includes a schematic, E-series component snapping, a component selection guide, graphs, the derivation of its formulas and a downloadable SPICE netlist. The architecture has to make adding a new calculator a self-contained job of about one folder.

**Decisions already made:** Vite + TypeScript with no UI framework. Schematics are inline SVG built from a reusable symbol library using IEC symbols (rectangle resistor). The down counter starts as a modulo-N synchronous flip-flop design, with a 74HC193/191 IC variant as a possible later extension.

**Revised after review (2026-09-25):** pre-rendered pages instead of hash routing; hand-written SVG plots instead of uPlot; separate E-series for R, C and L, stored in the URL; validation and snapping conventions added to `CalculatorDef`; the first milestone is now a vertical slice built around the RC low-pass; the ngspice check is required; netlists shared with LTspice are limited to a common subset; formula fixes for the differentiator, Wien bridge, buck and counter. Then: the calculator page has a fixed top panel (inputs and schematic) with tabs below instead of one long page, and every calculator lets the user choose which quantity it solves for.

---

## 1. Tech stack
| Concern | Choice | Why |
|---|---|---|
| Build | Vite + TypeScript (strict) | Static output, code splitting, fast dev loop |
| UI | Plain DOM plus a tiny `h()` element helper (no framework) | Smallest bundle, no hidden rendering cost |
| Pages | Multi-page static site: one pre-rendered HTML file per page (`/`, `/about/`, `/calc/<id>/`), generated at build time from each calculator's `meta.ts`. No client router; links are ordinary links. | Search engines can index real URLs; each page has its own `<title>`, description and OpenGraph preview; GitHub Pages serves the files directly, so no 404 workaround |
| State | Query string on the calculator page (`/calc/rc-lowpass/?solve=R&fc=1k&C=10n&eR=E24&eC=E12&tab=graphs&v=1`) | Every design can be shared by link |
| Maths display | KaTeX, **pre-rendered at build time** from Markdown + TeX and written straight into the calculator's HTML | No KaTeX JS at runtime; only CSS and fonts load, and only on calculator pages. The derivation is also indexable text. |
| Plots | Hand-written SVG (linear/log axes, Bode, waveform, timing diagram) | About 5 kB; follows the theme through CSS like the schematics do; no canvas redraw when the theme changes |
| Tests | Vitest (maths, E-series, parsing, netlist snapshots) + **required** ngspice CI job | Proves the formulas agree with simulation |
| Lint/format | ESLint + Prettier | — |
| Deploy | One GitHub Actions workflow: the deploy job `needs` the check jobs and runs only on `main` (`actions/deploy-pages`). `base` comes from `BASE_PATH`, defaulting to `/electronics-calculator/`. | Nothing deploys unless CI passes; a custom domain later only needs an env change |

## 2. Pages
- **Home (`/`)**: a one-line purpose statement, a filter box, category chips (Filters, Power, Op-amp circuits, Oscillators, Digital) and cards for every calculator. The filter works in the browser over the calculator metadata (title, summary, keywords, category). Cards are ranked by simple token matching (exact > prefix > substring, with title weighted above keywords) and update as you type. The filter state goes in `?q=…&cat=…` with `replaceState`. All cards are in the pre-rendered HTML, so the page works without JS. There is no separate search page.
- **Calculator (`/calc/<id>/`)**: a **top panel** holds the solve-for control, the input fields, the headline results and the schematic. **Tabs** below it hold everything else (see §4). The pre-rendered HTML contains the title, summary, the derivation (in its tab panel) and a placeholder for each area. `pages/calculator.ts` reads the id from a data attribute, lazily loads that calculator's chunk and renders the shared template.
- **About (`/about/`)**: assumptions, disclaimer, SPICE compatibility notes, licence and a link to the repo.

## 3. Directory layout
```
vite.config.ts               # base from BASE_PATH; registers the plugins below
build/
  pages-plugin.ts            # emits index.html, about/, calc/<id>/ from meta.ts files; serves the same pages in dev
  derivation-plugin.ts       # markdown-it + katex → static HTML inlined into calc/<id>/index.html
  templates/ page.html
scripts/
  new-calc.ts                # `npm run new-calc <id>`: copies calculators/_template/
  spice-check.ts             # CI: runs `ngspice -b` on generated netlists and compares .meas results
src/
  pages/ home.ts calculator.ts about.ts   # one entry script per page type
  ui/ h.ts field.ts solve-control.ts results.ts tabs.ts settings.ts spice-panel.ts guide-panel.ts
  lib/
    units.ts                 # parse/format SI: "4k7", "100n", "2.2µ", "1M" (mega), "1m" (milli)
    eseries.ts               # E3…E192 tables, nearest(), bestPair(), bestRatio()
    pipeline.ts              # solve → snap → analyse → spread (see §4)
    solve.ts                 # bracketed root finder for solve options with no closed form
    tolerance.ts             # corners(): evaluates analyse() at every ± tolerance corner
    url.ts                   # read/write query-string state, version + migrate
    complex.ts               # small complex-number type
    freq.ts                  # logspace sweep, evaluate H(jω), magnitude in dB / phase
    spice.ts                 # Netlist builder + SPICE value formatting ("Meg", never "M")
    opamp.ts                 # single-pole op-amp model (GBW, SR, output limits) shared by plots and SPICE
  schematic/
    symbols.ts               # IEC symbols, added as calculators need them (see §7)
    draw.ts                  # grid layout API: place(sym, x, y, rot), wire(pts), label()
  plot/ axes.ts bode.ts waveform.ts timing.ts   # SVG
  styles/ tokens.css base.css components.css
  calculators/
    registry.ts              # import.meta.glob(['./*/meta.ts', '!./_template/**'], {eager}) + lazy import('./*/index.ts')
    types.ts                 # CalculatorDef, VarSchema, SolveOption, Outcome, Snapped
    _template/               # starting point for new-calc; excluded from the registry
    rc-lowpass/  meta.ts index.ts derivation.md rc-lowpass.test.ts
    buck/ …   differentiator/ …   wien-bridge/ …   down-counter/ …
.github/workflows/ ci.yml    # lint, typecheck, test, ngspice, build, deploy (main only)
CONTRIBUTING.md              # "How to add a calculator"
LICENSE
```

The pages plugin loads the `meta.ts` files through Vite's own SSR module loader, so metadata stays in typed TypeScript.

## 4. Architecture for adding calculators
Each calculator is **one folder**, started with `npm run new-calc <id>`. The registry and the pages plugin both discover it by glob, so there is no central list to edit.

- `meta.ts` (eager, tiny): `{ id, title, category, keywords, summary }`. This feeds the Home page, the pre-rendered page's `<title>`/description, and the filter, without loading any calculator code. Keywords include common misspellings, e.g. "wein" for Wien.
- `derivation.md` is Markdown with TeX, rendered at build time into the calculator's HTML. It is static text: live numbers from the current design appear in the results, not in the derivation.
- `index.ts` (lazy chunk) exports a `CalculatorDef`.

### 4.1 Solving for different quantities
The user chooses what to solve for. With an RC low-pass, they might know R and C and want fc, or know C and fc and want R. Each calculator therefore declares every quantity once, as a **variable**, and lists the **solve options** it supports. A solve option names one or more target variables; every other variable is an input.

```ts
// Every quantity is declared once. `part` variables are snapped to the series for their type when solved for.
const vars = {
  fc: qty({ label: 'Cut-off frequency', unit: 'Hz' }),
  R:  part('R', { label: 'Resistor' }),
  C:  part('C', { label: 'Capacitor' }),
  f:  qty({ label: 'Evaluate at', unit: 'Hz' }),   // in no solve option, so always an input
} satisfies VarSchema;
type V = ValuesOf<typeof vars>;   // { fc: number; R: number; C: number; f: number }

const def: CalculatorDef<typeof vars, Out> = {
  vars,
  solveFor: [                                      // first option is the default
    { id: 'R',  label: 'R',  targets: ['R'] },
    { id: 'C',  label: 'C',  targets: ['C'] },
    { id: 'fc', label: 'fc', targets: ['fc'] },
  ],
  // Stage 1: fill in the targets from the known values. Returns ideal (unsnapped) values.
  solve: {
    R:  ({ fc, C }) => ok({ R: 1 / (2 * Math.PI * fc * C) }),
    C:  ({ fc, R }) => ok({ C: 1 / (2 * Math.PI * fc * R) }),
    fc: ({ R, C })  => ok({ fc: 1 / (2 * Math.PI * R * C) }),
  },
  // Stage 2: every variable is now known, and solved parts are snapped. Compute everything else,
  // including what the chosen parts actually achieve.
  analyse: (v, s) => {
    const fc = 1 / (2 * Math.PI * v.R * v.C);
    return ok({ out: { fc, tau: v.R * v.C /* … */ }, achieved: { fc } });
  },
  // results, schematic, plots, guide, spice …
};
```

```ts
interface SolveOption<S> { id: string; label: string; targets: (keyof S)[] }

interface Snapped { ideal: number; value: number; err: number }   // err = value / ideal − 1

type Outcome<T> =
  | { ok: true; value: T; warnings: Warning[] }
  | { ok: false; errors: FieldError[] };   // FieldError = { field: variable key | null; message }

interface CalculatorDef<S extends VarSchema, O> {
  vars: S;
  solveFor: SolveOption<S>[];
  urlVersion: number;                                   // bump when variables change
  migrate?(q: URLSearchParams, from: number): URLSearchParams;
  solve: Record<string, (known: Partial<ValuesOf<S>>, s: Settings) => Outcome<Partial<ValuesOf<S>>>>;
  analyse(v: ValuesOf<S>, s: Settings): Outcome<{ out: O; achieved: Partial<ValuesOf<S>> }>;
  results(v: ValuesOf<S>, o: O, s: Settings): ResultRow[];   // rows marked `headline` go in the top panel
  schematic(v: ValuesOf<S>, o: O): SchematicDoc;
  plots?(v: ValuesOf<S>, o: O): PlotSpec[];             // bode | waveform | timing
  guide(v: ValuesOf<S>, o: O, s: Settings): GuideItem[];
  spice?(v: ValuesOf<S>, o: O): Netlist | Unavailable;  // Unavailable carries the reason shown to the user
}
```

The shared **pipeline** (`lib/pipeline.ts`) runs the same steps for every calculator:
1. **Parse** the input variables of the chosen solve option.
2. **Solve**: call `solve[option]` to get ideal values for the targets. Solvers are closed-form where possible; `lib/solve.ts` provides a bracketed root finder for the rest.
3. **Snap**: each solved `part` target is snapped to the series for its type, giving a `Snapped` value. Parts the user typed in are used as entered; the results note when one is not in the selected series.
4. **Analyse**: `analyse` runs with every variable known, using the snapped part values.
5. **Compare**: for each input variable that `analyse` returns in `achieved` (e.g. the target fc), the results show **target → achieved → error**. For each solved part, they show **ideal → snapped → error**.
6. **Spread**: if the design has parts, `analyse` is re-run at every ± tolerance corner of the parts (at most 2⁶ runs), and each `achieved` value shows its min–max. This is generic, so every calculator gets it without extra code.

Schematic, SPICE and guide always use the snapped values.

**Switching the solve option** keeps the design continuous. The value just solved (the snapped value, for a part) becomes the input for that field. The field that becomes the new target is filled in by the solver. So switching from "solve for R" to "solve for fc" keeps the chosen R and shows the fc it gives.

### 4.2 Page layout
- **Top panel** (always visible):
  - Left: the **Solve for** control, the input fields, the headline results and any warnings or errors.
  - Right: the schematic, with live value labels.
  - Solved fields stay in their usual position but are read-only, shown with an accent tint and a "solved" marker. The layout does not move when the solve option changes.
- **Tabs** below the top panel: **Graphs · Results · Components · Derivation · SPICE**.
  - **Graphs**: the calculator's plots.
  - **Results**: the full results table with ideal/snapped values and tolerance spread.
  - **Components**: the selection guide.
  - **Derivation**: pre-rendered at build time.
  - **SPICE**: the netlist with **Copy** and **Download .cir** buttons, or the reason when no netlist is available.
  - The default tab is Graphs, or Results for a calculator without plots. The active tab is stored in the URL (`tab=`), so a link can open straight to the SPICE netlist.
  - Only the visible tab is rendered. Hidden tabs are marked stale when inputs change and re-render when shown.
  - The tabs follow the WAI-ARIA tabs pattern: arrow keys, Home and End.
- **Wide screens** (≥ 900px wide and ≥ 700px tall): the page fills the viewport without scrolling. The top panel has a capped height, and the schematic scales to fit it. The tab panel fills the remaining height and scrolls internally, so the inputs and schematic never leave the screen.
- **Narrow or short screens:** the inputs, then the schematic, then the tabs, in normal page scroll. Once the top panel scrolls out of view, a compact sticky strip shows the solved value(s) and the headline results. Tapping it scrolls back to the inputs.

### 4.3 Validation, settings and URL state
- **Validation:** `solve` and `analyse` never throw for bad input. Errors tied to a field appear under that field; errors with `field: null` and all warnings appear in the top panel under the headline results. When the outcome is not ok, the schematic and tabs keep showing the last valid design, dimmed.
- **Settings** (settings bar on calculator pages):
  - Series for each part type: R (default E24), C (default E12), L (default E6), each E3…E192 or none. The bar shows only the part types the current calculator uses.
  - Tolerance for each part type (defaults R 1 %, C 5 %, L 20 %).
  - Theme: auto / light / dark.
  - Series and tolerance are **always written into the calculator URL**, so a shared link reproduces the sender's results. localStorage only remembers the viewer's preferred defaults (used when a URL doesn't carry them) and the theme.
- **URL state:** `solve`, the input variables, the settings and `tab`. Solved values are not stored, because they are recomputed. Input changes update the query string with `history.replaceState`, so typing does not add history entries. `v` records `urlVersion`, and `migrate` upgrades old links when a calculator's variables change.

## 5. Calculators (v1 scope)
**SPICE target:** ngspice, checked in CI. Analogue netlists use only a subset that both ngspice and LTspice accept: R, C, L, D, S with `.model`, E and V sources, `.ac`, `.tran` (with `uic`) and instance `IC=`. There are no behavioural B-sources, and no `.meas` in the downloaded netlists (CI adds its own). The shared op-amp subcircuit is an E-source gain stage, one RC pole, diode clamps to the output limits and a unity buffer, so the netlists work without vendor models. LTspice compatibility is checked by hand before v1.0.

**SPICE value formatting:** SPICE is case-insensitive, so `1M` means milli. `spice.ts` always writes `Meg` for 10⁶, and a test covers it.

### 5.1 RC Low-Pass Filter
- Solve for: **R** (from fc, C) · **C** (from fc, R) · **fc** (from R, C). Always an input: the evaluation frequency f.
- Outputs: fc = 1/(2πRC) achieved by the snapped parts, its error against the target, and its tolerance spread; τ; 10–90% rise time 2.2τ; attenuation and phase at f.
- Headline results: fc and τ.
- Graphs: Bode magnitude and phase; step response.
- Selection guide: source impedance ≪ R; load impedance ≥ 10·R; capacitor dielectric (C0G for accuracy, X7R warnings including DC-bias loss).
- SPICE: `.ac dec 100` plus `.tran` step. CI measures the −3 dB point and requires it to match fc within 1 %.
- Serves as the **pilot**: it is built first and proves every piece of the architecture end to end.

### 5.2 Buck Converter (asynchronous and synchronous)
- Always inputs: topology (asynchronous/synchronous), Vin min/max, Vout, Iout, fsw, Vref for the feedback divider, efficiency estimate, diode V_F (asynchronous only), Cout ESR.
- Solve for:
  - **L and Cout** from an inductor ripple % target and an output ripple target.
  - **Ripple**: ΔI_L and ΔV_out from the chosen L and Cout.
- Duty cycle: asynchronous D = (Vout + V_F) / (Vin + V_F); synchronous D ≈ Vout / (η·Vin). D is shown at both Vin min and Vin max.
- Outputs: D, L (sized at **Vin max**, where ripple is worst), ΔI_L, I_pk, I_L,rms, Cout (capacitance and ESR terms), Cin plus its RMS ripple current Iout·√(D(1−D)), CCM/DCM boundary load ΔI_L/2, and a feedback divider pair from `bestRatio()` with a divider-current check. The divider is always designed from Vout and Vref in v1.
- Headline results: D, L, I_pk, ΔV_out.
- Validation: error if Vout ≥ Vin min; warning if D at Vin min exceeds a typical controller's maximum duty.
- Graphs: inductor-current and switch-node waveforms; output LC filter Bode showing resonance and the ESR zero.
- Selection guide: inductor I_sat > I_pk with margin; Cout ripple-current rating; **ceramic Cout loses capacitance under DC bias** (effective value often half the nominal, so check the derating curve); MOSFET V_DS and I_D ratings; diode (Schottky) or synchronous rectification; controller current limit ≥ I_pk.
- SPICE: open-loop power stage at the computed D using a PULSE-driven switch. The inductor and output capacitor start at the computed steady-state current and voltage (`IC=`, `.tran … uic`), so the simulation settles in a few cycles instead of many LC time constants.

### 5.3 Analog Differentiator (practical form: R1 in series with C, Cf across Rf)
- H(s) = −sRfC / ((1+sR1C)(1+sRfCf)).
- Always inputs: op-amp GBW, and the input amplitude and frequency.
- Solve for:
  - **Components** (Rf, R1, Cf) from f_a (where the gain crosses 0 dB), f_b (upper corner: the top of the band that is differentiated) and C. Rf = 1/(2πf_aC), R1 = 1/(2πf_bC), Cf = R1C/Rf, so RfCf = R1C and the two poles coincide at f_b.
  - **Frequencies** (f_a, f_b) from Rf, R1, Cf and C. Warns when RfCf and R1C differ enough that the two poles separate.
- Validation: error if f_b ≤ f_a; warning if f_b is not well below √(f_a·GBW), the frequency where the uncompensated noise gain meets the op-amp's open-loop gain.
- Outputs: Rf, R1, Cf, f_a and f_b achieved by the snapped parts, phase margin estimate.
- Headline results: f_a, f_b, phase margin.
- Graphs: closed-loop Bode with the **op-amp open-loop gain and noise gain overlaid**, which shows where the intersection gives a stability problem.
- Selection guide: minimum GBW; slew rate ≥ 2π·f·Vpk; input bias/noise notes.
- SPICE: `.ac` and `.tran` with the shared op-amp subcircuit.

### 5.4 Wien Bridge Oscillator (the misspelling "Wein" is kept in the keywords)
- f0 = 1/(2πRC). Steady oscillation needs a gain of exactly 3 (Rf/Rg = 2), but at exactly 3 it will not start. The design sets the small-signal gain a few percent above 3 and relies on the stabilisation element to pull it back.
- Always inputs: amplitude-stabilisation method (diodes, JFET, NTC or lamp), start-up gain margin.
- Solve for: **R** (from f0, C) · **C** (from f0, R) · **f0** (from R, C).
- Outputs: f0 achieved by the snapped parts, its error and tolerance spread, Rf/Rg, and for the diode method the estimated output amplitude.
- Headline results: f0 and its error.
- Graphs: feedback network β(jω), with a peak of 1/3 and 0° phase at f0.
- Selection guide: GBW ≳ 100·3·f0 for low distortion; slew rate ≥ 2π·f0·Vpk; component matching tolerance.
- SPICE: diode method only; `.tran` with a small capacitor `IC=` kick to show start-up and amplitude settling. JFET, NTC and lamp stabilisation depend on an AGC loop or thermal time constant that the portable subset cannot model, so the SPICE tab says so.

### 5.5 Digital Down Counter (modulo-N synchronous, D flip-flops)
- Always inputs: clock frequency, logic family (74HC/74AC/74LVC), Vcc. Default t_pd/t_su come from a table per family at the selected Vcc; Vcc affects only these timing values.
- Solve for:
  - **Output frequency** from N (2–16 in v1).
  - **N** from a wanted output frequency: N = round(f_clk / f_out). Error if the result is outside 2–16; the achieved f_out = f_clk/N and its error are shown.
- Minimisation: exact minimal sum-of-products for each next-state bit by exhaustive cover search, which is practical for ≤ 4 variables. Unused states are don't-cares.
- **Self-start check:** after minimisation, follow each unused state's next state. If any unused state never reaches the counting sequence (lockout), assign its next state explicitly and minimise again. The results show where every unused state goes.
- Outputs: number of flip-flops, the state and next-state table, the minimised equations, the terminal-count frequency f_clk/N, each Q output's period and duty cycle, terminal-count decode, and f_max = 1/(t_clk→Q + t_pd·levels + t_su) compared against the clock frequency. Levels are counted from the real gate tree: 2-input '08/'32 gates cascaded when fan-in exceeds 2, plus any inverters not covered by Q̅ outputs.
- Headline results: N, f_out, f_max margin.
- Graphs: an SVG **timing diagram** (a Bode plot does not apply here).
- Schematic (v1): the flip-flop column with clock and Q/Q̅ nets, and each D input labelled with its equation. A full gate-level schematic is in the backlog.
- Selection guide: logic family by f_max margin and Vcc; fan-out; decoupling; glitch-free terminal count.
- SPICE: ngspice XSPICE digital primitives (`d_dff`, `d_and`, `d_or`, `d_inverter`). The clock is a PULSE source through `adc_bridge`, and Q outputs go through `dac_bridge` so they can be plotted. The netlist is labelled ngspice-only.
- **Future:** a 74HC193/191 presettable IC variant.

## 6. UI style guide (clear, simple, performant)
- **Typography:** system font stack; 16px base; modular scale 1.25; `font-variant-numeric: tabular-nums` for all results; monospace for SPICE and units.
- **Colour:** neutral greys plus **one** accent colour. Semantic colours only for status: ok, warn, fail. Everything is a CSS custom property in `tokens.css`, with the dark theme set through `prefers-color-scheme` plus a manual override. Schematics and plots use `currentColor` and CSS variables so they follow the theme. Plot series colours come from a fixed palette of four.
- **Layout:** max content width about 72rem; 8px spacing scale; 16px gutters on mobile. Calculator pages use the top-panel-plus-tabs layout in §4.2: two columns in the top panel at ≥ 900px, one column below that.
- **Forms:** the **Solve for** control is a segmented control above the fields. Label above each field; unit shown as a fixed suffix; input accepts SI prefixes ("4k7"), where `M` is mega, `m` is milli and `meg` is also accepted; errors appear inline under the field; results recalculate on input with a debounce and **no submit button**.
- **Results:** headline results sit in the top panel; the full table (name | value | unit) is in the Results tab. Snapped values show the ideal value muted next to them; tolerance spread shows as min–max. Guide items have ok/warn badges written as text as well as colour.
- **No gimmicks:** no animation beyond 100 ms focus/hover transitions, no parallax, no modals, no carousels, no icon fonts, and no web fonts except KaTeX's maths fonts.
- **Accessibility:** WCAG AA contrast; the whole site works by keyboard; visible focus rings; tabs follow the WAI-ARIA tabs pattern; each SVG has a `<title>` and `<desc>`; plots have a data-table fallback. Only the headline results are an `aria-live="polite"` region, so screen readers are not flooded while the user types.
- **Performance budget:** shell JS per page ≤ 30 kB gzipped; each calculator chunk ≤ 20 kB gzipped; KaTeX CSS and fonts only on calculator pages; only the visible tab is rendered; Lighthouse Performance and Accessibility ≥ 95; no layout shift (the top panel, schematic, plots and tab panel have fixed sizes or aspect ratios, and switching tabs or solve options never moves the top panel).

## 7. Roadmap & task list

**M0 — Foundations**
- [ ] Scaffold Vite + TS strict, ESLint, Prettier, Vitest
- [ ] Choose a licence; add `LICENSE`
- [ ] `ci.yml`: lint, typecheck, test, build; deploy job `needs` them and runs only on `main`
- [ ] `base` from `BASE_PATH`
- [ ] Pages plugin emitting Home, About and one stub calculator page (build and dev server)
- [ ] `tokens.css` and base styles, header/footer shell, theme toggle (auto/light/dark)
- ✅ Exit: an empty shell is live on GitHub Pages

**M1 — Pilot vertical slice: RC low-pass**
- [ ] Draft `CalculatorDef`, `VarSchema`, `SolveOption`, `Outcome` and `Snapped`, then check them on paper against all five calculators by writing each one's `vars`, `solveFor` list and output type. Adjust before building on them.
- [ ] `units.ts` and `eseries.ts`, with tests (all tables checked against IEC 60063, including the legacy E24 values and `m`/`M` parsing)
- [ ] `pipeline.ts` (solve → snap → analyse → compare → spread), `solve.ts`, `tolerance.ts`, with tests
- [ ] `complex.ts`, `freq.ts`, `url.ts`; `spice.ts` netlist builder (with the `Meg` test)
- [ ] Symbols R, C, V source, GND, node dot; `draw.ts` layout API
- [ ] SVG plot axes, Bode and step-response plots
- [ ] Derivation plugin (Markdown + KaTeX → HTML in the Derivation tab panel)
- [ ] Registry and calculator page template: top panel (solve-for control, fields with solved state, headline results, schematic), tabs with lazy rendering and `tab=` in the URL, viewport-height layout on wide screens, sticky strip on narrow screens
- [ ] Settings bar (series and tolerance per part type), validation display, URL state with `replaceState` and versioning
- [ ] RC low-pass, fully implemented with tests for all three solve options
- [ ] Home page with filter and category chips
- [ ] SPICE copy and download
- [ ] Required ngspice CI job (`scripts/spice-check.ts`): fc agrees within 1 %
- [ ] `_template/` and `npm run new-calc`; `CONTRIBUTING.md` "Add a calculator" guide, written from the pilot
- ✅ Exit: **v0.1 public** — one complete calculator, indexable pages and a working filter

**M2 — Op-amp calculators**
- [ ] `opamp.ts` and the portable op-amp subcircuit; op-amp and diode symbols
- [ ] Analog differentiator (with a stability overlay)
- [ ] Wien bridge oscillator
- [ ] ngspice checks: differentiator gain at a test frequency, Wien f0 from the simulated period
- ✅ Exit: v0.2

**M3 — Power**
- [ ] L, switch, NMOS and Schottky symbols; SVG waveform plot
- [ ] Buck converter (waveforms, LC Bode, divider selection)
- [ ] ngspice check: average Vout and output ripple within tolerance
- ✅ Exit: v0.3

**M4 — Digital**
- [ ] Exact minimiser for ≤ 4 variables, with the self-start/lockout check, plus tests
- [ ] D-FF and gate symbols; SVG timing-diagram renderer
- [ ] Down counter, including the flip-flop schematic, timing diagram and XSPICE netlist
- [ ] ngspice check: simulated count sequence matches the state table
- ✅ Exit: v0.4

**M5 — v1.0 hardening**
- [ ] Accessibility audit, Lighthouse run, performance-budget check in CI
- [ ] Cross-browser check (Chromium, Firefox, Safari), mobile layout check
- [ ] Manual LTspice run of every analogue netlist; record the results on the About page
- [ ] Review all derivations and guide texts for accuracy
- ✅ Exit: **v1.0**

**Backlog:** 74HC193/191 counter variant, gate-level counter schematic with automatic layout, SPICE models for JFET/NTC/lamp Wien stabilisation, closed-loop buck with compensation, feedback divider as a buck solve option (Vout from a chosen divider), more filters (high-pass, Sallen-Key), boost converter, 555 timer, LED resistor, voltage divider, printable/PDF export of designs.

## 8. Verification
- `npm run test`:
  - Unit tests for every solve option against hand-calculated reference values (e.g. R = 10 kΩ, C = 15.9 nF → fc ≈ 1.001 kHz).
  - **Round-trip tests:** solve a target, then feed the unsnapped result back and solve for one of the original inputs; it must match within 1e-9.
  - Validation errors for out-of-range inputs, E-series snapping, SI parsing and SPICE value formatting.
- CI runs `ngspice -b` on every generated netlist. Each calculator's test file lists the `.meas` statements and tolerances that the simulation must meet (fc, f0, output voltage and ripple, count sequence). A failure blocks deploy.
- `npm run build && npm run preview`, then open `/electronics-calculator/`. Check:
  - the Home filter
  - every solve option and switching between them (values carry over)
  - every tab
  - the theme toggle
  - a shared-URL round trip including `solve`, `tab`, series and tolerance
  - at 1280×720, that switching tabs or solve options never moves the inputs or schematic and the page itself does not scroll
  - at phone width, that the sticky strip appears once the inputs scroll away
  - in the page source, that the title, description and derivation are in the pre-rendered HTML
- Before v1.0, paste each analogue `.cir` into LTspice and confirm it runs and matches the calculator.
- Lighthouse on the deployed site meets the budgets in §6.
