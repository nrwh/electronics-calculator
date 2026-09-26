// KiCad schematics are rendered at build time by build/kicad-plugin.ts.
declare module '*.kicad_sch' {
  import type { KicadSchematic } from './schematic/kicad';
  const schematic: KicadSchematic;
  export default schematic;
}
