// Recognizes CSI (escape character, then "[", then letter) sequences in shell command output:
// SGR ("m") codes are interpreted into styled segments; any other CSI sequence (cursor
// movement, clear-line, etc.) is dropped from the visible text — terminal control noise in a
// static transcript view.

export type AnsiSegment = { text: string; className?: string };

// Built from a string (rather than a /.../ literal containing the raw control character) so the
// escape byte is unambiguous in source: ESC, "[", digits/semicolons, then a letter.
const ESC = String.fromCodePoint(27);
const CSI_RE = new RegExp(String.raw`${ESC}\[([\d;]*)([A-Za-z])`, 'g');

const STANDARD_FG = new Set([30, 31, 32, 33, 34, 35, 36, 37]);
const STANDARD_BG = new Set([40, 41, 42, 43, 44, 45, 46, 47]);
const BRIGHT_FG = new Set([90, 91, 92, 93, 94, 95, 96, 97]);
const BRIGHT_BG = new Set([100, 101, 102, 103, 104, 105, 106, 107]);

type SgrState = { fg?: number; bg?: number; bold?: boolean; underline?: boolean };

function classNameFor(state: SgrState): string | undefined {
  const classes: string[] = [];
  if (state.fg !== undefined) classes.push(`ansi-fg-${state.fg}`);
  if (state.bg !== undefined) classes.push(`ansi-bg-${state.bg}`);
  if (state.bold) classes.push('ansi-bold');
  if (state.underline) classes.push('ansi-underline');
  return classes.length > 0 ? classes.join(' ') : undefined;
}

function applySgr(state: SgrState, params: string): SgrState {
  const codes = params === '' ? [0] : params.split(';').map(Number);
  let next = state;
  for (const code of codes) {
    switch (true) {
      case code === 0: { next = {}; break; }
      case code === 1: { next = { ...next, bold: true }; break; }
      case code === 22: { next = { ...next, bold: false }; break; }
      case code === 4: { next = { ...next, underline: true }; break; }
      case code === 24: { next = { ...next, underline: false }; break; }
      case code === 39: { next = { ...next, fg: undefined }; break; }
      case code === 49: { next = { ...next, bg: undefined }; break; }
      case STANDARD_FG.has(code): { next = { ...next, fg: code - 30 }; break; }
      case STANDARD_BG.has(code): { next = { ...next, bg: code - 40 }; break; }
      case BRIGHT_FG.has(code): { next = { ...next, fg: code - 90 + 8 }; break; }
      case BRIGHT_BG.has(code): { next = { ...next, bg: code - 100 + 8 }; break; }
      // Unsupported codes (256-color, truecolor, etc.) are ignored rather than erroring.
      default: { break; }
    }
  }
  return next;
}

export function hasAnsiCodes(text: string): boolean {
  CSI_RE.lastIndex = 0;
  return CSI_RE.test(text);
}

export function parseAnsi(text: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  let state: SgrState = {};
  let lastIndex = 0;
  CSI_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CSI_RE.exec(text)) !== null) {
    const [full, params, cmd] = match;
    const chunk = text.slice(lastIndex, match.index);
    if (chunk) segments.push({ text: chunk, className: classNameFor(state) });
    lastIndex = match.index + full.length;
    if (cmd === 'm') state = applySgr(state, params);
  }
  const rest = text.slice(lastIndex);
  if (rest) segments.push({ text: rest, className: classNameFor(state) });
  return segments;
}
