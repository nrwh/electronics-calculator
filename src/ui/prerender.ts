// Build-time rendering of a calculator's default design into its page (see build/pages-plugin.ts).

import type { AnyCalculatorDef } from '../calculators/types';
import { findOption, runPipeline } from '../lib/pipeline';
import { partTypes } from '../lib/url';
import { topPanelHtml, type TopPanel } from './markup';
import { DEFAULT_SETTINGS } from './settings';

export function prerender(def: AnyCalculatorDef): TopPanel {
  const raw = Object.fromEntries(Object.entries(def.vars).map(([k, d]) => [k, d.default]));
  const solve = findOption(def, null).id;
  const r = runPipeline(def, solve, raw, DEFAULT_SETTINGS);
  return topPanelHtml(def, partTypes(def), raw, solve, DEFAULT_SETTINGS, r);
}
