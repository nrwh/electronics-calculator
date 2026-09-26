// Imports of *.kicad_sch files: the schematic is parsed and rendered at build time (see
// build/kicad/render.ts), so the page only receives a small SVG template.

import fs from 'node:fs';
import path from 'node:path';
import { normalizePath, type Plugin } from 'vite';
import { renderSchematic } from './kicad/render';

export function kicadPlugin(): Plugin {
  let root = process.cwd();
  return {
    name: 'ec-kicad',
    enforce: 'pre',
    configResolved(config) {
      root = config.root;
    },
    load(id) {
      const file = id.split('?')[0]!;
      if (!file.endsWith('.kicad_sch')) return null;
      const rel = normalizePath(path.relative(root, file));
      const model = renderSchematic(fs.readFileSync(file, 'utf8'), rel);
      return `export default ${JSON.stringify(model)};`;
    },
  };
}
