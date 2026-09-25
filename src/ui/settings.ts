// Viewer preferences (localStorage), theme, and the settings bar on calculator pages.

import type { PartType, Settings } from '../calculators/types';
import { SERIES_NAMES, type SeriesChoice } from '../lib/eseries';
import { settingsBarHtml } from './markup';

export const DEFAULT_SETTINGS: Settings = {
  series: { R: 'E24', C: 'E12', L: 'E6' },
  tol: { R: 1, C: 5, L: 20 },
};

const PREFS_KEY = 'ec-prefs';
const THEME_KEY = 'ec-theme';

export type Theme = 'auto' | 'light' | 'dark';

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode, blocked site data); preferences just aren't remembered.
  }
}

export function isSeries(v: unknown): v is SeriesChoice {
  return v === 'none' || (SERIES_NAMES as readonly unknown[]).includes(v);
}

export function isTolerance(v: unknown): v is number {
  return typeof v === 'number' && v > 0 && v <= 50;
}

/** The viewer's preferred defaults, used when a URL doesn't carry settings. */
export function loadPrefs(): Settings {
  const s: Settings = structuredClone(DEFAULT_SETTINGS);
  try {
    const p = JSON.parse(storageGet(PREFS_KEY) ?? '{}') as Partial<Settings>;
    for (const t of ['R', 'C', 'L'] as PartType[]) {
      if (isSeries(p.series?.[t])) s.series[t] = p.series[t];
      if (isTolerance(p.tol?.[t])) s.tol[t] = p.tol[t];
    }
  } catch {
    // Ignore malformed preferences.
  }
  return s;
}

export function savePrefs(s: Settings): void {
  storageSet(PREFS_KEY, JSON.stringify(s));
}

export function getTheme(): Theme {
  const t = storageGet(THEME_KEY);
  return t === 'light' || t === 'dark' ? t : 'auto';
}

export function setTheme(t: Theme): void {
  if (t === 'auto') {
    delete document.documentElement.dataset.theme;
    try {
      localStorage.removeItem(THEME_KEY);
    } catch {
      // ignore
    }
  } else {
    document.documentElement.dataset.theme = t;
    storageSet(THEME_KEY, t);
  }
}

/** Wire up the theme select in the site header. */
export function initThemeControl(): void {
  const sel = document.getElementById('theme') as HTMLSelectElement | null;
  if (!sel) return;
  sel.value = getTheme();
  sel.addEventListener('change', () => setTheme(sel.value as Theme));
}

/**
 * Settings bar: series and tolerance for each part type the calculator uses. Renders the same
 * markup as the pre-rendered page, then binds the selects.
 */
export function renderSettingsBar(
  container: HTMLElement,
  types: PartType[],
  settings: Settings,
  onChange: (s: Settings) => void,
): void {
  container.hidden = !types.length;
  container.innerHTML = settingsBarHtml(types, settings);
  for (const t of types) {
    const series = container.querySelector<HTMLSelectElement>(`#set-e${t}`)!;
    const tol = container.querySelector<HTMLSelectElement>(`#set-t${t}`)!;
    const update = (): void => {
      const next: Settings = structuredClone(settings);
      next.series[t] = series.value as SeriesChoice;
      next.tol[t] = Number(tol.value);
      settings = next;
      onChange(next);
    };
    series.addEventListener('change', update);
    tol.addEventListener('change', update);
  }
}
