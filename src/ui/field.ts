// Binds behaviour to a field rendered by fieldHtml() (see markup.ts): label, text input or select
// with a fixed unit suffix, a "solved" mark and a message line.

import type { FieldView } from './markup';

export interface FieldHandle {
  readonly key: string;
  readonly el: HTMLElement;
  readonly input: HTMLInputElement | HTMLSelectElement;
  /** Show a view. The text of an input field is only replaced while it is solved (read-only). */
  apply(view: FieldView): void;
  /** Force the text (used when a solved value becomes an input). */
  setText(text: string): void;
}

export function bindField(
  el: HTMLElement,
  onInput: (key: string, raw: string) => void,
  /** Called when a text input's value is committed: on leaving the field or pressing Enter. */
  onCommit?: (key: string) => void,
): FieldHandle {
  const key = el.dataset.key!;
  const input = el.querySelector<HTMLInputElement | HTMLSelectElement>('input, select')!;
  const mark = el.querySelector<HTMLElement>('.solved-mark')!;
  const msg = el.querySelector<HTMLElement>('.field-msg')!;
  input.addEventListener(input instanceof HTMLSelectElement ? 'change' : 'input', () =>
    onInput(key, input.value),
  );
  if (input instanceof HTMLInputElement && onCommit) {
    input.addEventListener('change', () => onCommit(key));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') onCommit(key);
    });
  }

  const setText = (text: string): void => {
    if (input.value !== text) input.value = text;
  };

  return {
    key,
    el,
    input,
    setText,
    apply(view) {
      el.hidden = view.hidden;
      el.classList.toggle('solved', view.solved);
      el.classList.toggle('has-error', view.error);
      mark.hidden = !view.solved;
      if (input instanceof HTMLInputElement) {
        input.readOnly = view.solved;
        input.setAttribute('aria-readonly', String(view.solved));
        input.tabIndex = view.solved ? -1 : 0;
        if (view.solved) setText(view.text);
      }
      input.setAttribute('aria-invalid', String(view.error));
      msg.textContent = view.message;
      msg.classList.toggle('error', view.error);
    },
  };
}
