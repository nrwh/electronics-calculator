// CI: simulate each calculator's netlists in ngspice and compare the measurements with the
// calculator's own numbers. Cases live in src/calculators/<id>/spice-checks.ts.
//
//   npm run spice-check                 all calculators
//   npm run spice-check -- rc-lowpass   one calculator
//   NGSPICE=/path/to/ngspice npm run spice-check

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';
import { kicadPlugin } from '../build/kicad-plugin';
import type { AnyCalculatorDef, Settings, SpiceCase, SpiceDesign } from '../src/calculators/types';
import { runPipeline } from '../src/lib/pipeline';
import { isUnavailable } from '../src/lib/spice';
import { DEFAULT_SETTINGS } from '../src/ui/settings';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const calcDir = path.join(root, 'src/calculators');
const outDir = path.join(root, '.spice-out');
const ngspice = process.env.NGSPICE ?? 'ngspice';

interface Row {
  calc: string;
  name: string;
  label: string;
  expected: number;
  measured: number;
  err: string;
  pass: boolean;
}

/** Parse "name = value" lines printed by ngspice's meas command. */
export function parseMeasurements(stdout: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of stdout.split(/\r?\n/)) {
    const m = /^\s*([a-z_][a-z0-9_]*)\s*=\s*([-+]?\d[\d.]*(?:e[-+]?\d+)?)/i.exec(line);
    if (m) out[m[1]!.toLowerCase()] = Number(m[2]);
  }
  return out;
}

function simulate(file: string): { stdout: string; ok: boolean } {
  const res = spawnSync(ngspice, ['-b', file], { encoding: 'utf8', timeout: 120_000 });
  if (res.error) throw new Error(`Could not run ${ngspice}: ${res.error.message}`);
  const stdout = `${res.stdout}\n${res.stderr}`;
  return { stdout, ok: res.status === 0 };
}

async function main(): Promise<void> {
  const only = process.argv.slice(2);
  const ids = fs
    .readdirSync(calcDir, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        !d.name.startsWith('_') &&
        fs.existsSync(path.join(calcDir, d.name, 'spice-checks.ts')),
    )
    .map((d) => d.name)
    .filter((id) => !only.length || only.includes(id));
  fs.mkdirSync(outDir, { recursive: true });

  const rows: Row[] = [];
  const problems: string[] = [];
  for (const id of ids) {
    // Loaded through Vite so that imports such as *.kicad_sch schematics resolve.
    const opts = { configFile: false as const, root, logLevel: 'silent' as const, plugins: [kicadPlugin()] };
    const def = (await runnerImport<{ default: AnyCalculatorDef }>(path.join(calcDir, id, 'index.ts'), opts))
      .module.default;
    const cases = (
      await runnerImport<{ default: SpiceCase[] }>(path.join(calcDir, id, 'spice-checks.ts'), opts)
    ).module.default;
    for (const c of cases) {
      const raw = Object.fromEntries(Object.entries(def.vars).map(([k, d]) => [k, c.raw?.[k] ?? d.default]));
      const settings: Settings = { ...structuredClone(DEFAULT_SETTINGS), ...c.settings };
      const r = runPipeline(def, c.solve, raw, settings);
      if (!r.ok) {
        problems.push(
          `${id} / ${c.name}: design failed: ${[...r.errors, ...Object.values(r.fieldErrors)].join('; ')}`,
        );
        continue;
      }
      const netlist = def.spice?.(r.values as never, r.out);
      if (!netlist || isUnavailable(netlist)) {
        problems.push(`${id} / ${c.name}: no netlist`);
        continue;
      }
      const design: SpiceDesign = { values: r.values!, out: r.out, achieved: r.achieved };
      const control = typeof c.control === 'function' ? c.control(design) : c.control;
      const file = path.join(outDir, `${id}--${c.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.cir`);
      fs.writeFileSync(file, netlist.toString(['.control', 'run', ...control, '.endc']));
      const sim = simulate(file);
      const meas = parseMeasurements(sim.stdout);
      fs.writeFileSync(file.replace(/\.cir$/, '.log'), sim.stdout);
      for (const chk of c.checks) {
        const expected = chk.expected(design);
        const measured = meas[chk.meas.toLowerCase()];
        let pass = false;
        let err = 'not measured';
        if (measured !== undefined && Number.isFinite(measured)) {
          if (chk.absTol !== undefined) {
            const d = measured - expected;
            err = `${d >= 0 ? '+' : ''}${d.toPrecision(3)} (±${chk.absTol})`;
            pass = Math.abs(d) <= chk.absTol;
          } else {
            const rel = measured / expected - 1;
            const tol = chk.relTol ?? 0.01;
            err = `${(rel * 100).toFixed(3)} % (±${(tol * 100).toFixed(2)} %)`;
            pass = Math.abs(rel) <= tol;
          }
        }
        rows.push({
          calc: id,
          name: c.name,
          label: chk.label,
          expected,
          measured: measured ?? NaN,
          err,
          pass,
        });
      }
      if (!sim.ok && c.checks.length === 0) problems.push(`${id} / ${c.name}: ngspice exited with an error`);
    }
  }

  const fmt = (x: number): string => (Number.isFinite(x) ? x.toPrecision(6) : '—');
  console.log('');
  for (const r of rows) {
    console.log(
      `${r.pass ? 'PASS' : 'FAIL'}  ${r.calc} / ${r.name} / ${r.label}: calculator ${fmt(r.expected)}, ngspice ${fmt(r.measured)}, error ${r.err}`,
    );
  }
  for (const p of problems) console.log(`FAIL  ${p}`);
  const failed = rows.filter((r) => !r.pass).length + problems.length;
  console.log(
    `\n${rows.length - rows.filter((r) => !r.pass).length} passed, ${failed} failed. Netlists and logs: ${path.relative(root, outDir)}/`,
  );
  if (!rows.length && !problems.length) console.log('No SPICE checks found.');
  process.exit(failed ? 1 : 0);
}

await main();
