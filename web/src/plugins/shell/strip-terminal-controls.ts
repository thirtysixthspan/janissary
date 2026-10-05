// Text the shell tab writes on the user's behalf — a command line sent to zsh, an application reply
// rendered into the terminal — must reach its reader as text and nothing else. An embedded escape
// could end a bracketed paste early so the following lines run one by one, or make xterm answer a
// query into the shell's input. Removes every escape sequence with what it introduces, every C0
// control except newline and tab, DEL, and the C1 controls. A single forward scan rather than a
// pattern, so its cost is linear in the text whatever the text holds.
const ESC = 0x1B;
const BEL = 0x07;
const STRING_TERMINATOR = 0x9C;
const CONTROL_STRING_INTRODUCERS = new Set([']', 'P', 'X', '^', '_']);

function codeAt(text: string, index: number): number {
  return text.codePointAt(index) ?? -1;
}

function isRemovedControl(code: number): boolean {
  if (code === 0x09 || code === 0x0A) return false;
  return code < 0x20 || (code >= 0x7F && code <= 0x9F);
}

// Parameters and intermediates run until a final byte, which ends the sequence with it. Anything
// outside those ranges cuts the sequence short and is left for the caller to look at.
function controlSequenceEnd(text: string, start: number): number {
  let index = start;
  while (index < text.length) {
    const code = codeAt(text, index);
    if (code >= 0x40 && code <= 0x7E) return index + 1;
    if (code < 0x20 || code > 0x3F) return index;
    index += 1;
  }
  return index;
}

// An OSC, DCS, SOS, PM or APC string runs to BEL or a string terminator. Any other escape inside it
// ends the string there and starts a sequence of its own.
function controlStringEnd(text: string, start: number): number {
  let index = start;
  while (index < text.length) {
    const code = codeAt(text, index);
    if (code === BEL || code === STRING_TERMINATOR) return index + 1;
    if (code === ESC) return text[index + 1] === '\\' ? index + 2 : index;
    index += 1;
  }
  return index;
}

function escapeEnd(text: string, start: number): number {
  const introducer = text[start];
  if (introducer === '[') return controlSequenceEnd(text, start + 1);
  if (introducer !== undefined && CONTROL_STRING_INTRODUCERS.has(introducer)) return controlStringEnd(text, start + 1);
  let index = start;
  while (index < text.length && codeAt(text, index) >= 0x20 && codeAt(text, index) <= 0x2F) index += 1;
  const final = codeAt(text, index);
  return final >= 0x30 && final <= 0x7E ? index + 1 : index;
}

export function stripTerminalControls(text: string): string {
  let result = '';
  let index = 0;
  while (index < text.length) {
    const code = codeAt(text, index);
    if (code === ESC) {
      index = escapeEnd(text, index + 1);
      continue;
    }
    if (!isRemovedControl(code)) result += text[index];
    index += 1;
  }
  return result;
}
