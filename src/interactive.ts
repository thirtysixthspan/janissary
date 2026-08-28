import { commandSegments } from './command-tokens.js';
import { learnedCommands } from './interactive-learned.js';

// Full-screen / interactive programs that need a real TTY and live keystroke
// forwarding (a pager like `less`, an editor like `vim`, a monitor like `top`).
// These cannot run through the piped persistent shell, which only scrapes output.
const INTERACTIVE_PROGRAMS = new Set([
  'less', 'more', 'most', 'man', 'info',
  'vi', 'vim', 'nvim', 'nano', 'emacs', 'pico', 'micro', 'ed',
  'top', 'htop', 'btop', 'atop', 'glances',
  'watch', 'tmux', 'screen', 'mc', 'ncdu', 'lazygit', 'tig',
  'ssh', 'telnet', 'ftp', 'sftp',
  'python', 'python3', 'node', 'irb', 'ipython', 'psql', 'mysql', 'sqlite3',
]);

/**
 * Decide whether a shell command should run in an interactive PTY session.
 * Inspects each pipeline/sequence segment so things like `git log | less` are caught.
 *
 * Matches the built-in list above plus anything learned by watching a program take over a terminal
 * (`interactive-learned.ts`). A learned key is either a bare program name or a `program subcommand`
 * pair, so `git log` can be known without making every `git` command interactive.
 */
export function isInteractive(command: string): boolean {
  const learned = learnedCommands();
  for (const { program, argument } of commandSegments(command)) {
    if (INTERACTIVE_PROGRAMS.has(program)) return true;
    if (learned.has(program)) return true;
    if (argument && learned.has(`${program} ${argument}`)) return true;
  }
  return false;
}
