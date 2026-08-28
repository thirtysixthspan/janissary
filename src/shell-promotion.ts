import { messageBus } from './bus.js';
import { showsTerminalTakeover } from './interactive-signals.js';
import { recordLearnedCommand } from './interactive-learned.js';
import type { Managers } from './managers.js';

// What a promoted command's transcript entry ends up reading. The bytes captured before the takeover
// are the torn first fragment of a full-screen repaint, so they are dropped rather than shown — the
// terminal already showed the user everything.
export const TERMINAL_ENTRY_NOTE = '(ran in terminal)';

// Enough to carry a repainted screen and its escape sequences into the newly-mounted terminal,
// while bounding what a long-running command can push through the socket on promotion.
const REPLAY_MAX_BYTES = 64 * 1024;

// Owns one running command's promotion: watching its output for a program taking over the screen,
// switching the tab into terminal takeover when that happens, and restoring the transcript when the
// command finishes. A tab is only ever promotable when its shell is PTY-backed, so `ptyId` absent
// means every entry point here is a no-op.
export type ShellPromotion = {
  observe: (output: string) => void;
  promote: () => void;
  isPromoted: () => boolean;
  finish: () => void;
};

export function createShellPromotion(
  managers: Managers,
  label: string,
  command: string,
  // Resolved lazily, not captured: the tab's shell is spawned on the first command's way into
  // `execute`, which is after the promotion for that command already exists.
  ptyIdOf: () => string | undefined,
  detect: boolean,
): ShellPromotion {
  let promoted = false;
  let latest = '';

  // `learn` separates the two ways a takeover starts: detection teaches the learned list, a user
  // forcing one with the button or chord does not — forcing a terminal is often a one-off intent.
  const takeOver = (learn: boolean): void => {
    const ptyId = ptyIdOf();
    if (promoted || !ptyId) return;
    promoted = true;
    const tab = managers.tab.tabs.find((t) => t.label === label);
    if (tab) tab.activePty = ptyId;
    const replay = latest.length > REPLAY_MAX_BYTES ? latest.slice(-REPLAY_MAX_BYTES) : latest;
    if (replay) messageBus.emit('pty', { type: 'data', id: ptyId, data: replay });
    managers.tab.markUnread(label);
    if (learn) recordLearnedCommand(command);
    messageBus.emit('state', { type: 'dirty' });
  };

  return {
    observe: (output) => {
      latest = output;
      if (!detect || promoted) return;
      if (showsTerminalTakeover(output)) takeOver(true);
    },
    promote: () => takeOver(false),
    isPromoted: () => promoted,
    // Driven by the command's delimiter, not by the PTY exiting: the tab's shell outlives the
    // program that took the screen, so its exit is never the signal to come back.
    finish: () => {
      if (!promoted) return;
      const tab = managers.tab.tabs.find((t) => t.label === label);
      if (tab) tab.activePty = undefined;
      messageBus.emit('state', { type: 'dirty' });
    },
  };
}
