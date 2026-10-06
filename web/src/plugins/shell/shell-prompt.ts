// The shell tab sets its prompt and every command line typed at it in bold, so they stand apart from
// the plain output between them. zsh draws its own prompt and edit line that way, configured by the
// hooks' setup line; the lines the tab writes into the terminal itself — an application command's
// echo, and the prompt it puts back after the reply — use the same attributes, so every command line
// in the scrollback looks alike whichever of the two wrote it.
const BOLD = '\u{1B}[1m';
const NORMAL_INTENSITY = '\u{1B}[22m';

// `%B…%b` bolds the prompt character, and `default:bold` bolds the text in zsh's line editor, which
// stays bold in the scrollback once the line runs. The other contexts keep zsh's own defaults, since
// assigning the array replaces all of them; a pasted line — which is how the command bar sends one —
// is bold like a typed one rather than drawn in reverse video.
export const ZSH_PROMPT_SETUP = "export PROMPT='%B>%b '; zle_highlight=(region:standout special:standout suffix:bold isearch:underline paste:bold default:bold)";

export const SHELL_PROMPT = `${BOLD}>${NORMAL_INTENSITY} `;

// The cells `> ` takes at the start of the prompt's row.
export const SHELL_PROMPT_WIDTH = 2;

export function shellCommandLine(line: string): string {
  return `${BOLD}> ${line}${NORMAL_INTENSITY}`;
}
