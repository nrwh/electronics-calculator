// A tiny element helper: h('div', { class: 'x', onclick: fn }, 'text', child).

export type Child = Node | string | number | null | undefined | false | Child[];

export type Props = {
  class?: string;
  style?: string;
  dataset?: Record<string, string>;
  html?: string;
} & Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = String(v);
      else if (k.startsWith('on') && typeof v === 'function')
        el.addEventListener(k.slice(2), v as EventListener);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

/** Replace an element's children. */
export function replace(el: Element, ...children: Child[]): void {
  el.textContent = '';
  append(el, children);
}

/** Symbol text with subscripts ("f_c" → f<sub>c</sub>) as DOM nodes. */
export function sym(s: string): Node {
  const frag = document.createDocumentFragment();
  const re = /_(\{[^}]*\}|[A-Za-z0-9]+)/g;
  let last = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    frag.appendChild(document.createTextNode(s.slice(last, m.index)));
    const sub = m[1]!.startsWith('{') ? m[1]!.slice(1, -1) : m[1]!;
    frag.appendChild(h('sub', null, sub));
    last = m.index + m[0].length;
  }
  frag.appendChild(document.createTextNode(s.slice(last)));
  return frag;
}

export function $(sel: string, root: ParentNode = document): HTMLElement {
  const el = root.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`Missing element ${sel}`);
  return el;
}
