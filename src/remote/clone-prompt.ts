// The y/n question a remote launch asks in its placeholder tab's terminal when the host offers to
// clone a missing project root, drawn locally so it renders where ssh's own prompts already do.
// Pure: the text to write, and what a chunk of keystrokes answers. Lines leave out the host, since
// the tab's host chip already shows it.

export type CloneOfferText = { path: string; url: string; home?: string };

export type CloneKeyAnswer = 'accept' | 'decline' | 'ignore';

const ESCAPE = '\u{1B}';
const CTRL_C = '\u{3}';
const DECLINING = new Set(['n', 'N', '\r', '\n', ESCAPE, CTRL_C]);

export function clonePromptText({ path, url, home }: CloneOfferText): string {
  const lead = home === undefined ? `${path} is not a clone of this project.` : `${home} has no clone of this project.`;
  return `${lead} Clone ${url} into ${path}? [y/N] `;
}

export function cloningLine({ path, url }: CloneOfferText): string {
  return `Cloning ${url} into ${path}…\r\n`;
}

// The accepted or declining key, echoed after the prompt.
export function cloneAnswerEcho(accept: boolean): string {
  return accept ? 'y\r\n' : 'n\r\n';
}

/**
 * What a chunk of keystrokes answers: `y` or `Y` accepts; `n`, `N`, Enter, Escape, or Ctrl-C
 * declines; anything else is ignored and the prompt stays up. The first deciding key in the chunk
 * wins. A chunk that begins with Escape and carries more — an arrow or function key's escape
 * sequence — is one other key, so it is ignored rather than read as a bare Escape.
 */
export function cloneKeyAnswer(data: string): CloneKeyAnswer {
  if (data.startsWith(ESCAPE) && data.length > 1) return 'ignore';
  for (const key of data) {
    if (key === 'y' || key === 'Y') return 'accept';
    if (DECLINING.has(key)) return 'decline';
  }
  return 'ignore';
}
