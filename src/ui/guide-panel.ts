// Component selection guide: each item has a text badge as well as a colour.

import type { GuideItem } from '../calculators/types';
import { h, replace, sym } from './h';

const BADGE: Record<GuideItem['status'], string> = { ok: 'OK', warn: 'Check', fail: 'Problem', info: 'Note' };

/** Guide text may use the same subscript shorthand as symbols ("f_c"). */
function text(s: string): Node {
  return sym(s);
}

export function renderGuide(container: HTMLElement, items: GuideItem[]): void {
  replace(
    container,
    h('h2', { class: 'panel-title' }, 'Components'),
    h(
      'ul',
      { class: 'guide' },
      items.map((it) =>
        h(
          'li',
          null,
          h('span', { class: `badge ${it.status}` }, BADGE[it.status]),
          h('div', null, h('h4', null, text(it.title)), h('p', null, text(it.text))),
        ),
      ),
    ),
  );
}
