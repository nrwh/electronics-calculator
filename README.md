# electronics-calculator

Web-based calculators for electronics design, published at
<https://nrwh.github.io/electronics-calculator/>.

Each calculator gives more than a number:

- choose what to solve for (for an RC filter: R, C or the cut-off frequency)
- E-series snapping for resistors, capacitors and inductors, with ideal → chosen → error
- the spread of the result across part tolerances
- a live schematic, graphs, and a component selection guide
- the derivation of every formula (rendered at build time with KaTeX)
- a SPICE netlist to copy or download, checked against ngspice in CI

Calculators: RC low-pass filter, buck converter, analog differentiator, Wien bridge oscillator and
a synchronous down counter.

## Development

Requires Node.js 22.12 or later. Schematics are drawn in [KiCad](https://www.kicad.org/) 10 or
later, which is only needed to edit them.

```sh
npm install
npm run dev          # http://localhost:5173/electronics-calculator/
npm test             # unit, contract and round-trip tests
npm run lint
npm run typecheck
npm run build        # static site in dist/
npm run preview      # serve dist/
npm run size-check   # performance budget, after a build
npm run spice-check  # simulate every netlist in ngspice (needs ngspice on PATH, or NGSPICE=/path)
npm run schematic-check  # KiCad ERC on every schematic (needs kicad-cli; skipped without it)
```

The site is plain TypeScript and DOM with no UI framework. Pages are pre-rendered HTML files
(one per calculator), so every calculator has its own indexable URL. A design's state is kept in
the query string, so a link reproduces it exactly.

`BASE_PATH` (default `/electronics-calculator/`) and `SITE_URL` set the deployment path and the
canonical URL, e.g. `BASE_PATH=/ npm run build` for a custom domain.

## Adding a calculator

```sh
npm run new-calc my-calculator
```

Adding a calculator is a one-folder job. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Deployment

`.github/workflows/ci.yml` runs lint, typecheck, tests, the ngspice checks and the build on every
push and pull request. On `main`, the deploy job publishes `dist/` to GitHub Pages, but only if
every check passes. In the repository settings, set **Pages → Source** to **GitHub Actions**.

## Licence

[MIT](LICENSE)
