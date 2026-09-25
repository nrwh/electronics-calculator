// SPICE tab: the netlist with Copy and Download .cir, or the reason no netlist is available.

import { isUnavailable, type Netlist, type Unavailable } from '../lib/spice';
import { h, replace } from './h';

export function renderSpice(container: HTMLElement, n: Netlist | Unavailable | undefined): void {
  const title = h('h2', { class: 'panel-title' }, 'SPICE');
  if (!n || isUnavailable(n)) {
    replace(
      container,
      title,
      h('p', { class: 'note' }, n ? n.reason : 'This calculator has no SPICE netlist.'),
    );
    return;
  }
  const text = n.toString();
  const status = h('span', { class: 'note', role: 'status' });
  const copy = h('button', { type: 'button', class: 'btn primary' }, 'Copy');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = 'Copied.';
    } catch {
      status.textContent = 'Copy failed; select the text and copy it instead.';
    }
  });
  const download = h('button', { type: 'button', class: 'btn' }, 'Download .cir');
  download.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = h('a', { href: url, download: `${n.fileName}.cir` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  replace(
    container,
    title,
    h('div', { class: 'spice-actions' }, copy, download, status),
    h(
      'p',
      { class: 'note' },
      n.ngspiceOnly
        ? 'This netlist uses ngspice XSPICE digital models and runs in ngspice only: ngspice -b file.cir'
        : 'Runs in ngspice (ngspice file.cir) and LTspice. LTspice runs one analysis at a time, so comment out the .ac or .tran line you do not need.',
    ),
    h('pre', { class: 'netlist', tabindex: '0' }, h('code', null, text)),
  );
}
