import type { IDecoration, IMarker, Terminal } from '@xterm/xterm';
import { SHELL_PROMPT_WIDTH } from './shell-prompt';

export const PROMPT_MASK_CLASS = 'shell-prompt-mask';

export type PromptMask = {
  setIdle(idle: boolean): void;
  dispose(): void;
};

// Hides the prompt zsh is waiting at while the keyboard is somewhere other than the terminal, so the
// command bar is the only prompt on screen. The mask is a decoration over the prompt's cells, painted
// in the terminal's background; zsh itself is never told, so nothing is typed into its input.
//
// zsh signals that it is idle before it draws the prompt, so the mask follows the cursor's row rather
// than being placed once: each cursor move while it applies re-places it on the row the prompt is on.
export function attachPromptMask(terminal: Terminal): PromptMask {
  let idle = false;
  let focused = terminal.textarea !== undefined && terminal.textarea === document.activeElement;
  let mask: { marker: IMarker; decoration: IDecoration | undefined } | undefined;

  const clear = () => {
    mask?.decoration?.dispose();
    mask?.marker.dispose();
    mask = undefined;
  };

  const cursorRow = () => terminal.buffer.active.baseY + terminal.buffer.active.cursorY;

  const update = () => {
    if (!idle || focused) { clear(); return; }
    if (mask && mask.marker.line === cursorRow()) return;
    clear();
    const marker = terminal.registerMarker(0);
    const decoration = terminal.registerDecoration({ marker, x: 0, width: SHELL_PROMPT_WIDTH, layer: 'top' });
    decoration?.onRender((element) => { element.classList.add(PROMPT_MASK_CLASS); });
    mask = { marker, decoration };
  };

  const onFocus = () => { focused = true; update(); };
  const onBlur = () => { focused = false; update(); };
  terminal.textarea?.addEventListener('focus', onFocus);
  terminal.textarea?.addEventListener('blur', onBlur);
  const cursor = terminal.onCursorMove(update);

  return {
    setIdle(next) {
      idle = next;
      update();
    },
    dispose() {
      cursor.dispose();
      terminal.textarea?.removeEventListener('focus', onFocus);
      terminal.textarea?.removeEventListener('blur', onBlur);
      clear();
    },
  };
}
