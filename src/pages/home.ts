// Home page: filter box and category list (with match counts) beside the pre-rendered cards.
// State in ?q=…&cat=…

import { rank, type FilterEntry } from '../lib/filter';
import { initShell } from '../ui/shell';

initShell();

const list = document.getElementById('cards') as HTMLUListElement;
const cards = Array.from(list.querySelectorAll<HTMLLIElement>('li.card'));
const input = document.getElementById('q') as HTMLInputElement;
const cats = Array.from(document.querySelectorAll<HTMLButtonElement>('.cat-list button'));
const status = document.getElementById('filter-status') as HTMLElement;

const entries: FilterEntry[] = cards.map((c) => ({
  title: c.dataset.title ?? '',
  keywords: (c.dataset.keywords ?? '').split('|'),
  summary: c.dataset.summary ?? '',
  category: c.dataset.category ?? '',
  categoryLabel: c.querySelector('.card-cat')?.textContent ?? '',
}));

const params = new URLSearchParams(location.search);
input.value = params.get('q') ?? '';
let category = params.get('cat') ?? '';
if (!cats.some((c) => c.dataset.cat === category)) category = '';

function apply(): void {
  // Counts follow the search text; the category only narrows the cards shown.
  const matches = rank(entries, input.value);
  for (const btn of cats) {
    const cat = btn.dataset.cat ?? '';
    const n = cat ? matches.filter((i) => entries[i]!.category === cat).length : matches.length;
    btn.querySelector('.cat-count')!.textContent = String(n);
    btn.classList.toggle('empty', n === 0);
    btn.setAttribute('aria-pressed', String(cat === category));
  }

  const order = rank(entries, input.value, category);
  const shown = new Set(order);
  cards.forEach((c, i) => (c.hidden = !shown.has(i)));
  for (const i of order) list.appendChild(cards[i]!);
  for (const [i, c] of cards.entries()) if (!shown.has(i)) list.appendChild(c);
  const filtered = input.value.trim() !== '' || category !== '';
  status.textContent = !filtered
    ? ''
    : order.length
      ? `${order.length} of ${cards.length} calculators`
      : 'No calculators match. Try a shorter word.';

  const q = new URLSearchParams();
  if (input.value.trim()) q.set('q', input.value.trim());
  if (category) q.set('cat', category);
  const qs = q.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

input.addEventListener('input', apply);
for (const btn of cats) {
  btn.addEventListener('click', () => {
    category = btn.dataset.cat ?? '';
    apply();
  });
}
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const first = cards.find((c) => !c.hidden)?.querySelector('a');
    if (first) location.href = first.href;
  }
});
apply();
