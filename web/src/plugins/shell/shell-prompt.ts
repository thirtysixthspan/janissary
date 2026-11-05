// The shell tab sets its prompt and every command line typed at it in bold, so they stand apart from
// the plain output between them. zsh draws its own prompt and edit line that way, configured by its
// startup files (`ZSH_PROMPT_SETUP` in `src/shell/zsh-startup/script.ts`); the lines the tab
// writes into the terminal itself — an application command's echo, and the prompt it puts back after
// the reply — use the same attributes, so every command line in the scrollback looks alike whichever
// of the two wrote it.
const BOLD = '\u{1B}[1m';
const NORMAL_INTENSITY = '\u{1B}[22m';

export const SHELL_PROMPT = `${BOLD}>${NORMAL_INTENSITY} `;

// The cells `> ` takes at the start of the prompt's row.
export const SHELL_PROMPT_WIDTH = 2;

export function shellCommandLine(line: string): string {
  return `${BOLD}> ${line}${NORMAL_INTENSITY}`;
}

const CLEAR_ROW = '\r\u{1B}[2K';

// What starts a reply written into the terminal: the row it lands on cleared, then the command line it
// answers. With no line, the reply continues beneath an echo already on screen, starting on the
// prompt row that echo left.
export function commandHead(line?: string): string {
  return line === undefined ? CLEAR_ROW : `${CLEAR_ROW}${shellCommandLine(line)}\r\n`;
}
