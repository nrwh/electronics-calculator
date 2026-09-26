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
| `schematic.kicad_sch` | The schematic, drawn in KiCad (see [Drawing the schematic](#drawing-the-schematic-in-kicad)). Rendered at build time into a small SVG template. |
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

- `results()` returns rows. Mark two or three with `headline: true` for the summary strip that stays in view while the page scrolls (and is announced to screen readers). Give a row `achieved: 'fc'` to show its target, error and spread.
- `schematic()` returns `kicad(sheet, { title, desc, vars })`, where `sheet` is the imported `.kicad_sch` file and `vars` fills in its `${NAME}` text variables. See [Drawing the schematic in KiCad](#drawing-the-schematic-in-kicad).
- `plots()` (optional) returns Bode, waveform or timing specs; the page draws them as SVG with a data-table fallback.
- `guide()` returns component selection advice with `ok` / `warn` / `fail` / `info` status.
- `spice()` returns a `Netlist`, or `unavailable(reason)`. Use only the subset that ngspice and LTspice both accept (see the About page). Use `spiceValue()` for numbers, which always writes `Meg` for 10⁶. The op-amp subcircuit is shared in `lib/opamp.ts`.

The default design (every variable at its `default`, first solve option) is rendered into the
page at build time: the fields, series settings and schematic. That avoids layout shift when
the script loads. So `solve`, `analyse`, `results` and `schematic` must not touch the DOM or
browser globals; they run in Node during the build.

### Drawing the schematic in KiCad

Schematics are drawn in [KiCad](https://www.kicad.org/) 10 or later (the files are in KiCad 10's
format, which older versions won't open) and saved in the calculator's folder. KiCad is only
needed to edit them: the site builds without it.

1. Open `src/calculators/<id>/schematic.kicad_sch` in KiCad's Schematic Editor (File → Open;
   no project is needed). `npm run new-calc` starts you with the template's voltage divider.
2. Use any symbol from KiCad's libraries, or draw your own in the Symbol Editor. KiCad copies
   the symbols it uses into the file, so it is self-contained. `src/schematic/ec.kicad_sym` has
   a few symbols made for these schematics: an op-amp without supply pins (mirror it to put the
   non-inverting input on top), an IEC D flip-flop, and an open terminal whose Value is its name.
   Add it in Preferences → Manage Symbol Libraries to reuse them.
3. Put **`${NAME}`** wherever the calculator fills in a value: a symbol's Value field
   (`${R}`), or any text (`ESR ${ESR}`). KiCad shows the text as typed; the page replaces it:

   ```ts
   import sheet from './schematic.kicad_sch';

   schematic: (v) =>
     kicad(sheet, {
       title: 'RC low-pass filter schematic',
       desc: `R1 (${formatSI(v.R, 'Ω')}) in series, C1 (${formatSI(v.C, 'F')}) to ground.`,
       vars: { R: formatSI(v.R, 'Ω'), C: formatSI(v.C, 'F') },
     }),
   ```

   Every `${NAME}` must be given and every given name must be used, so a typo fails the tests.
   Filled-in text is drawn in the accent colour; other text as labels. A `${FIELD}` that names
   another field of the same symbol (such as `${SIM.PARAMS}`) is resolved from the file, as
   KiCad does.
4. KiCad text markup works: `V_{out}` (subscript), `x^{2}` (superscript), `~{Q}` (overbar).
   Variable values use the same markup.
5. Save. `npm run dev` reloads the page.

What the site uses from the file: symbols (their graphics, pins and pin names), wires,
junctions, no-connect flags, labels, text and graphic lines, and the position, angle and
justification of every visible field and text. It ignores text sizes, colours, line widths,
pin numbers, the paper and the title block: the page's own styles apply, so every schematic
matches and follows the light and dark themes, and the drawing is cropped to its contents.
Buses, hierarchical sheets, images and text boxes are not supported and fail the build with the
file and line.

**Variants.** When the circuit itself changes with a choice (the buck's MOSFET or diode, the
down counter's number of flip-flops), draw one file per variant and pick it in `schematic()`:
`kicad(v.topology === 'sync' ? sync : async, …)`. When only a label changes, use a variable.

**Checks.** `npm run schematic-check` runs KiCad's ERC on every schematic (it needs
`kicad-cli` on PATH, in the default install location, or in `KICAD_CLI`, and skips otherwise).
It fails on drawing mistakes such as a dangling wire or an off-grid end, and counts pins and wire
ends left open (add `-- --verbose` to list them); those are fine when a wire ends at a text
label on purpose. `src/schematic/schematics.test.ts` renders every calculator's schematics
and snapshots them, so a schematic change shows up in review: check the diff, then accept it
with `npx vitest -u`.

KiCad's symbol libraries are licensed CC-BY-SA 4.0 with an exception for designs that use
them, which covers the symbols embedded in these schematics.

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
- [ ] `npm run schematic-check` passes, if you have KiCad
- [ ] Checked every solve option, switching between them, and every tab in `npm run dev`, at desktop and phone widths, in light and dark themes

## Code style

- TypeScript strict, no UI framework: build DOM with `h()` from `src/ui/h.ts`.
- Prettier formats the code (`npm run format`); ESLint must pass.
- Keep colours in `src/styles/tokens.css`. Schematics and plots use `currentColor` and CSS variables so they follow the theme.
