# Contributing

## How to add a calculator

A calculator is one folder under `src/calculators/`. The home page, the pre-rendered page, the
filter, the tests and the SPICE checks all find it by glob, so there is no central list to edit.

```sh
npm run new-calc sallen-key-lowpass -- --title "Sallen-Key low-pass filter"
npm run dev    # then open /electronics-calculator/calc/sallen-key-lowpass/
```

This copies `src/calculators/_template/`, a complete voltage-divider calculator, into
`src/calculators/sallen-key-lowpass/`:

| File | Purpose |
|---|---|
| `meta.ts` | `{ id, title, category, summary, keywords }`. Loaded eagerly and at build time: the page `<title>`, meta description, home card and filter. Keep it free of imports other than types. Put common misspellings in `keywords`. |
| `index.ts` | The `CalculatorDef` (default export). Loaded lazily as its own chunk (budget: 20 kB gzipped). |
| `derivation.md` | Markdown with TeX (`$…$`, `$$…$$`), rendered with KaTeX at build time into the Derivation tab. A TeX error fails the build. It is static text; live numbers belong in the results. |
| `<id>.test.ts` | Hand-calculated reference values for each solve option. |
| `spice-checks.ts` | ngspice measurements the netlist must match (run by `npm run spice-check` in CI). |

The RC low-pass (`src/calculators/rc-lowpass/`) is the reference implementation.

### 1. Variables

Declare every quantity once in `vars`:

```ts
const vars = {
  fc: qty({ label: 'Cut-off frequency', symbol: 'f_c', unit: 'Hz', default: '1k' }),
  R: part('R', { label: 'Resistor', default: '10k' }),   // snapped to the R series when solved for
  C: part('C', { label: 'Capacitor', default: '10n' }),
  f: qty({ label: 'Evaluate at', unit: 'Hz', default: '10k' }),  // in no solve option: always an input
};
```

- `qty` is a number with a unit. It must be positive unless `positive: false`; `min` and `max` are checked when it is parsed.
- `part('R' | 'C' | 'L', …)` is a component value. When it is solved for, it is snapped to the series the user chose for that part type, and it is varied in the tolerance spread.
- `int` is a whole number with `min` and `max`.
- `choice` is one of a fixed set of options, and is always an input. Other fields can depend on it with `showIf: { key, values }`.
- `symbol` uses `_` for subscripts: `V_out`, `f_{c,min}`.
- Variable names must not clash with the page's own query keys (`solve`, `tab`, `v`, `eR`, `eC`, `eL`, `tR`, `tC`, `tL`); the contract test checks this.

### 2. Solve options

```ts
solveFor: [
  { id: 'R', label: 'R', targets: ['R'] },    // the first option is the default
  { id: 'fc', label: 'f_c', targets: ['fc'] },
],
solve: {
  R: ({ fc, C }) => ok({ R: 1 / (2 * Math.PI * fc * C) }),
  fc: ({ R, C }) => ok({ fc: 1 / (2 * Math.PI * R * C) }),
},
```

`solve[option]` gets every input (target fields are `NaN`) and returns **ideal, unsnapped**
values for the targets. Use a closed form where one exists; `lib/solve.ts` has a bracketed root
finder for the rest.

### 3. Analyse

`analyse(values, settings)` runs with every variable known, and with solved parts already
snapped. Compute everything the page shows and return it as `out`. Return `achieved` for input
variables the design is meant to hit (e.g. `{ fc }`): the page shows **target → achieved →
error**, and the pipeline re-runs `analyse` at every tolerance corner to show each achieved
value's min–max spread.

### 4. Validation

`solve` and `analyse` must never throw for bad input:

- `fail('fc', 'Must be below …')` puts an error under that field.
- `fail(null, '…')` puts an error in the top panel.
- `ok(value, [{ field: null, message: '…' }])` returns warnings with a result.

When a result isn't valid, the page keeps showing the last valid design, dimmed.

### Derived parts

If `analyse` picks parts that aren't variables (the buck's feedback divider, the Wien bridge's Rf1 and Rf2), snap them with `nearest(x, settings.series.R)` or `bestRatio(...)`. List their part types in `extraSeries: ['R']` so that the settings bar shows that series.

### 5. Output

- `results()` returns rows. Mark two or three with `headline: true` for the top panel. Give a row `achieved: 'fc'` to show its target, error and spread.
- `schematic()` returns `new Sheet(...)…render()`, drawn from `schematic/symbols.ts` with `place(symbol, x, y, { rot, ref, value })` and `wire(...points)`. Coordinates are on a 10-unit grid. Add IEC symbols to `symbols.ts` as needed.
- `plots()` (optional) returns Bode, waveform or timing specs; the page draws them as SVG with a data-table fallback.
- `guide()` returns component selection advice with `ok` / `warn` / `fail` / `info` status.
- `spice()` returns a `Netlist`, or `unavailable(reason)`. Use only the subset that ngspice and LTspice both accept (see the About page). Use `spiceValue()` for numbers, which always writes `Meg` for 10⁶. The op-amp subcircuit is shared in `lib/opamp.ts`.

The default design (every variable at its `default`, first solve option) is rendered into the
page at build time: the fields, headline results and schematic. That avoids layout shift when
the script loads. So `solve`, `analyse`, `results` and `schematic` must not touch the DOM or
browser globals; they run in Node during the build.

### 6. Tests and SPICE checks

`src/calculators/contract.test.ts` automatically checks every calculator: metadata, defaults
that parse, every solve option running with the defaults, every renderer producing output
without `NaN`, SPICE values, and round trips (solve one option, feed the unsnapped result into
another, and get the original input back within 1e-9).

In `<id>.test.ts`, add hand-calculated reference values for every solve option and the
validation errors.

In `spice-checks.ts`, list the ngspice measurements and tolerances:

```ts
export default [
  {
    name: 'defaults',
    solve: 'R',
    control: ['setplot ac1', 'meas ac fc when vdb(out)=-3.0103'],
    checks: [{ meas: 'fc', label: '−3 dB frequency', expected: (r) => (r.out as Out).fc, relTol: 0.01 }],
  },
] satisfies SpiceCase[];
```

`npm run spice-check -- <id>` builds the design with the same pipeline as the page, appends a
`.control` block (`run`, then your commands), runs `ngspice -b`, and compares each `meas` result.
Netlists and logs are written to `.spice-out/`.

### Checklist

- [ ] `npm test`, `npm run lint` and `npm run typecheck` pass
- [ ] `npm run spice-check -- <id>` passes
- [ ] `npm run build && npm run size-check` pass
- [ ] Checked every solve option, switching between them, and every tab in `npm run dev`, at desktop and phone widths, in light and dark themes

## Code style

- TypeScript strict, no UI framework: build DOM with `h()` from `src/ui/h.ts`.
- Prettier formats the code (`npm run format`); ESLint must pass.
- Keep colours in `src/styles/tokens.css`. Schematics and plots use `currentColor` and CSS variables so they follow the theme.
