// Binds the "Solve for" segmented control rendered by solveControlHtml() (a radio group, so arrow
// keys work natively).

export function bindSolveControl(
  root: HTMLElement,
  onChange: (id: string) => void,
): { set(id: string): void } {
  const inputs = Array.from(root.querySelectorAll<HTMLInputElement>('input[name="solve"]'));
  for (const input of inputs) input.addEventListener('change', () => input.checked && onChange(input.value));
  return {
    set(id) {
      for (const input of inputs) input.checked = input.value === id;
    },
  };
}
