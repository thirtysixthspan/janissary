// Recognizing an interactive program from what it *does*, for the programs `interactive.ts`'s name
// list doesn't know about. Only two sequences count as evidence:
//
//   - entering the alternate screen, which is what a program sends when it wants the whole display
//     (`less`, `vim`, `htop`, `fzf`, `lazygit` all do);
//   - repeatedly addressing the cursor absolutely, which catches a TUI that repaints in place
//     without switching screens.
//
// Hiding the cursor is deliberately not evidence: npm, vitest, and docker all do it for spinners,
// and counting it would drag a routine `npm install` into a full-tab terminal.
//
// The patterns are built rather than written as literals so the escape byte is unambiguous in
// source, matching how `web/src/transcript/ansi.ts` spells its CSI pattern.
const ESC = String.fromCodePoint(27);
const ALTERNATE_SCREEN = new RegExp(String.raw`${ESC}\[\?(?:1049|47)h`);
const ABSOLUTE_CURSOR = new RegExp(String.raw`${ESC}\[\d{1,4};\d{1,4}H`, 'g');

// How many absolute cursor moves separate a TUI's repaint loop from a one-off jump. A starting
// value rather than a measured one: raise it, or require the moves inside a time window, if a
// progress display is ever found tripping it.
const CURSOR_MOVE_THRESHOLD = 3;

/**
 * Whether `output` shows a program taking over the terminal.
 *
 * Takes the whole output accumulated so far, not a delta — which is what `executeShellCmd` streams
 * (`onProgress` is handed the entire buffer each time). That means a sequence can never be observed
 * half-arrived, and it is why this is a plain predicate rather than a stateful scanner: re-running
 * it over a growing buffer recounts from scratch instead of accumulating.
 */
export function showsTerminalTakeover(output: string): boolean {
  if (ALTERNATE_SCREEN.test(output)) return true;
  ABSOLUTE_CURSOR.lastIndex = 0;
  let moves = 0;
  while (ABSOLUTE_CURSOR.exec(output) !== null) {
    moves++;
    if (moves >= CURSOR_MOVE_THRESHOLD) { ABSOLUTE_CURSOR.lastIndex = 0; return true; }
  }
  return false;
}
