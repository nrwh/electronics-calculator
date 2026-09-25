// WAI-ARIA tabs (automatic activation): arrow keys, Home and End move between tabs.

import type { TabId } from '../lib/url';

export interface TabsHandle {
  select(id: TabId, focus?: boolean): void;
  current(): TabId;
  setAvailable(id: TabId, available: boolean): void;
}

export function initTabs(root: HTMLElement, initial: TabId, onShow: (id: TabId) => void): TabsHandle {
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const idOf = (t: HTMLElement): TabId => t.id.replace(/^tab-/, '') as TabId;
  let current = initial;

  const select = (id: TabId, focus = false): void => {
    current = id;
    for (const t of tabs) {
      const on = idOf(t) === id;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls')!)!;
      panel.hidden = !on;
      panel.classList.toggle('shown', on);
      if (on && focus) t.focus();
    }
    onShow(id);
  };

  const visible = (): HTMLButtonElement[] => tabs.filter((t) => !t.hidden);

  root.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLButtonElement>('[role="tab"]');
    if (t) select(idOf(t));
  });
  root.addEventListener('keydown', (e) => {
    const list = visible();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % list.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + list.length) % list.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    if (next >= 0) {
      e.preventDefault();
      select(idOf(list[next]!), true);
    }
  });

  select(initial);
  return {
    select,
    current: () => current,
    setAvailable(id, available) {
      const t = tabs.find((x) => idOf(x) === id);
      if (t) t.hidden = !available;
    },
  };
}
