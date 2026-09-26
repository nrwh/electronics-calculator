// Run KiCad's electrical rules check (ERC) on every calculator schematic.
//
//   npm run schematic-check
//   npm run schematic-check -- --verbose       also list unconnected pins and wire ends
//   KICAD_CLI=/path/to/kicad-cli npm run schematic-check
//
// Fails on drawing mistakes (a dangling wire, an off-grid end, a duplicate reference, …). Lists
// unconnected pins and wire ends without failing, since a schematic sometimes ends a wire at a
// text label on purpose. Skips, with a notice, when KiCad isn't installed.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** --verbose also lists the unconnected pins and wire ends. */
const verbose = process.argv.includes('--verbose');

/** Not problems for the site's schematics. */
const IGNORED = new Set([
  'unresolved_variable', // ${NAME} is filled in by the calculator
  'lib_symbol_issues', // the symbols are embedded; the "ec" library needn't be installed
  'power_pin_not_driven', // no PWR_FLAG needed for a design schematic
  'pin_not_driven',
  'simulation_model_issue',
  'footprint_link_issues',
  'footprint_filter',
]);
/** Listed, but allowed. */
const NOTED = new Set(['pin_not_connected', 'unconnected_wire_endpoint']);

interface Violation {
  type: string;
  description: string;
  severity: string;
  items: { description: string; pos: { x: number; y: number } }[];
}

function findKicadCli(): string | null {
  const candidates = [process.env.KICAD_CLI, 'kicad-cli'];
  if (process.platform === 'win32') {
    const base = 'C:/Program Files/KiCad';
    if (fs.existsSync(base))
      for (const v of fs.readdirSync(base).sort().reverse())
        candidates.push(path.join(base, v, 'bin/kicad-cli.exe'));
  }
  if (process.platform === 'darwin')
    candidates.push('/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli');
  for (const c of candidates) {
    if (!c) continue;
    const r = spawnSync(c, ['version'], { encoding: 'utf8' });
    if (!r.error && r.status === 0) return c;
  }
  return null;
}

function schematics(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((d) => d.isFile() && d.name.endsWith('.kicad_sch'))
    .map((d) => path.join(d.parentPath, d.name))
    .sort();
}

const cli = findKicadCli();
if (!cli) {
  console.log('schematic-check: kicad-cli not found (install KiCad 10 or set KICAD_CLI); skipped.');
  process.exit(0);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ec-erc-'));
let failures = 0;
for (const file of schematics(path.join(root, 'src/calculators'))) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const report = path.join(tmp, 'erc.json');
  const r = spawnSync(cli, ['sch', 'erc', '--format', 'json', '--output', report, file], {
    encoding: 'utf8',
  });
  if (!fs.existsSync(report)) {
    console.log(`FAIL  ${rel}: KiCad could not check it\n${r.stdout}${r.stderr}`);
    failures++;
    continue;
  }
  const data = JSON.parse(fs.readFileSync(report, 'utf8')) as { sheets: { violations: Violation[] }[] };
  fs.rmSync(report);
  const found = data.sheets.flatMap((s) => s.violations).filter((v) => !IGNORED.has(v.type));
  const bad = found.filter((v) => !NOTED.has(v.type));
  const noted = found.filter((v) => NOTED.has(v.type));
  failures += bad.length;
  console.log(
    `${bad.length ? 'FAIL' : 'ok  '}  ${rel}${noted.length ? ` (${noted.length} open end${noted.length > 1 ? 's' : ''})` : ''}`,
  );
  for (const v of verbose ? [...bad, ...noted] : bad) {
    // KiCad reports positions in units of 100 mm.
    const where = v.items.map(
      (i) => `${i.description} at (${(i.pos.x * 100).toFixed(2)}, ${(i.pos.y * 100).toFixed(2)}) mm`,
    );
    console.log(`      ${NOTED.has(v.type) ? 'note' : v.severity}: ${v.description}: ${where.join('; ')}`);
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
if (failures) {
  console.log(
    `\n${failures} problem${failures > 1 ? 's' : ''}. Open the file in KiCad and run Inspect → Electrical Rules Checker.`,
  );
  process.exit(1);
}
