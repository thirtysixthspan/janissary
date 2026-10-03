// What one line typed into the shell tab's command line means, decided without any I/O.
//
// The bar is the only input path in this tab, so every keystroke in it is either a key the shell
// understands, a key the terminal would have sent, or a line for the application. These three pure
// functions are the whole of that decision, split out from the component so each rule can be checked
// on its own rather than through a render.

// `!` as the first character forces the shell. Everything else is offered to the application first,
// which is what makes a word that happens to name a command behave like one — and what makes `!` the
// only way to send that word to the shell. A shell sitting at a `read` prompt cannot be given `theme`.
export type LineRoute = 'shell' | 'application';

export function routeFor(text: string): LineRoute {
  return text.startsWith('!') ? 'shell' : 'application';
}

// The line as the shell receives it: the `!` is a routing marker and is not part of it. `!` alone
// sends nothing, so a stray marker does not submit a blank command.
export function shellLine(text: string): string {
  const line = text.startsWith('!') ? text.slice(1) : text;
  return line.trim();
}

// The control characters a terminal would send for the keys the application claims for itself, named
// rather than written literally so the file holds no invisible characters. Module scope, not exported:
// `controlCharacterFor` below is the whole of the module's answer to that question.
// `Ctrl+C` is deliberately absent from the unconditional case: whether it interrupts or copies depends
// on whether the bar holds a selection, which only the handler knows.
const INTERRUPT = 3;
const END_OF_INPUT = 4;
const SUSPEND = 26;
const CONTROL_KEYS = {
  'ctrl+c': String.fromCodePoint(INTERRUPT),
  'ctrl+d': String.fromCodePoint(END_OF_INPUT),
  'ctrl+z': String.fromCodePoint(SUSPEND),
} as const;

export type ControlKey = keyof typeof CONTROL_KEYS;

// The control character for a key, or nothing when the bar holds a selection — `Ctrl+C` copies then,
// because a shortcut that only ever interrupts would leave the user unable to copy by keyboard at all.
export function controlCharacterFor(key: ControlKey, hasSelection: boolean): string | undefined {
  if (key === 'ctrl+c' && hasSelection) return undefined;
  return CONTROL_KEYS[key];
}