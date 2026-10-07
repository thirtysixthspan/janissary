import type { Terminal } from '@xterm/xterm';

// xterm.js focuses its own textarea on every mousedown inside it, so a single click would hand the
// terminal the keyboard for as long as the button is held — lighting its focus line, uncovering the
// prompt and showing the cursor — before the tab's click handler gives the keyboard back to the
// command bar. A capture listener on the container runs ahead of xterm's and disables the textarea
// for that one press, which turns xterm's `focus()` into a no-op without stopping its selection or
// mouse reporting. The second press of a double-click is left alone, so it still gives the terminal
// the keyboard.
//
// The textarea is released by a listener on xterm's own element, which runs after xterm's even when
// xterm stops the press from propagating. A press stopped before it reaches that element is released
// on the next task, and every press releases any earlier hold before deciding on its own.
export function holdFocusOffSinglePress(
  container: HTMLElement,
  terminal: Pick<Terminal, 'element' | 'textarea'>,
): () => void {
  let held: HTMLTextAreaElement | undefined;
  const release = () => {
    if (held) held.disabled = false;
    held = undefined;
  };
  const onPress = (event: MouseEvent) => {
    release();
    const textarea = terminal.textarea;
    if (!textarea || event.button !== 0 || event.detail > 1 || document.activeElement === textarea) return;
    held = textarea;
    textarea.disabled = true;
    setTimeout(release, 0);
  };
  const element = terminal.element;
  container.addEventListener('mousedown', onPress, { capture: true });
  element?.addEventListener('mousedown', release);
  return () => {
    release();
    container.removeEventListener('mousedown', onPress, { capture: true });
    element?.removeEventListener('mousedown', release);
  };
}
