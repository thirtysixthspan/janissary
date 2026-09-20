// Janissary types commands into a harness PTY on the user's behalf — a scheduled command firing,
// or a `send <label> <text>` command — as one burst write followed by a separately delayed Enter.
// A burst write is exactly what a terminal delivers for a paste, so harnesses whose composers
// classify such input that way are given the framing a paste carries: the text wrapped in
// bracketed-paste markers, which routes it through their explicit-paste path and keeps the
// delayed Enter an unconditional submit. codex's composer is the one harness that needs this
// today: without the framing it classifies the write as a paste burst and suppresses any Enter
// within 120ms of the last burst character — inserting a newline instead of submitting, with the
// window stretching further the longer the command is. Harnesses without that behavior, and
// anything else that can live behind the harness view (an ssh tab runs programs that never asked
// for paste framing), are written plain.
const PASTE_FRAME_NAMES = new Set(['codex']);
const PASTE_START = '\u{1B}[200~';
const PASTE_END = '\u{1B}[201~';
const ENTER_DELAY_MS = 50;

export type HarnessPty = { input: (id: string, data: string) => void };

export function typeIntoHarness(pty: HarnessPty, ptyId: string, name: string, text: string): void {
  pty.input(ptyId, PASTE_FRAME_NAMES.has(name) ? `${PASTE_START}${text}${PASTE_END}` : text);
  setTimeout(() => pty.input(ptyId, '\r'), ENTER_DELAY_MS);
}
