const BRACKETED_PASTE_START = '\u{1B}[200~';
const BRACKETED_PASTE_END = '\u{1B}[201~';

export function shellCommandInput(command: string): string {
  if (!command.includes('\n')) return `${command}\n`;
  return `${BRACKETED_PASTE_START}${command}${BRACKETED_PASTE_END}\r`;
}
