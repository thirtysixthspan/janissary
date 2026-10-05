import { stripTerminalControls } from './strip-terminal-controls';

const BRACKETED_PASTE_START = '\u{1B}[200~';
const BRACKETED_PASTE_END = '\u{1B}[201~';

export function shellCommandInput(command: string): string {
  const text = stripTerminalControls(command);
  if (!text.includes('\n')) return `${text}\n`;
  return `${BRACKETED_PASTE_START}${text}${BRACKETED_PASTE_END}\r`;
}
