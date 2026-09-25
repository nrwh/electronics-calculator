// npm run new-calc <id> [-- --title "Human title"]
// Copies src/calculators/_template/ to src/calculators/<id>/ and fills in the id and title.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const calcDir = path.join(root, 'src/calculators');

function usage(msg?: string): never {
  if (msg) console.error(`Error: ${msg}\n`);
  console.error(
    'Usage: npm run new-calc <id> [-- --title "Title"]\n  <id> is lower-case kebab-case, e.g. sallen-key-lowpass',
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--'));
const titleIdx = args.indexOf('--title');
if (!id) usage();
if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(id)) usage(`"${id}" is not kebab-case`);
const title =
  titleIdx >= 0 && args[titleIdx + 1]
    ? args[titleIdx + 1]!
    : id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

const src = path.join(calcDir, '_template');
const dest = path.join(calcDir, id);
if (fs.existsSync(dest)) usage(`src/calculators/${id} already exists`);

fs.mkdirSync(dest);
for (const file of fs.readdirSync(src)) {
  const text = fs
    .readFileSync(path.join(src, file), 'utf8')
    .replace(/__ID__/g, id)
    .replace(/__TITLE__/g, title);
  const name = file === 'calc.test.ts' ? `${id}.test.ts` : file;
  fs.writeFileSync(path.join(dest, name), text);
  console.log(`created src/calculators/${id}/${name}`);
}
console.log(`
Next:
  1. Edit meta.ts: category, summary, keywords.
  2. Replace the example maths in index.ts (vars, solveFor, solve, analyse, results, schematic, plots, guide, spice).
  3. Write derivation.md and the reference values in ${id}.test.ts.
  4. Add ngspice measurements to spice-checks.ts.
  5. npm run dev, then open /calc/${id}/. npm test && npm run spice-check before opening a PR.`);
