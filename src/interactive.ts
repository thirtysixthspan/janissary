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

// Prefixes that wrap another command; skip them to find the real program.
const WRAPPERS = new Set(['sudo', 'env', 'command', 'nice', 'nohup', 'time', 'doas', 'stdbuf']);

const basename = (token: string): string => token.replace(/^.*\//, '');

/**
 * Decide whether a shell command should run in an interactive PTY session.
 * Inspects each pipeline/sequence segment so things like `git log | less` are caught.
 */
export function isInteractive(command: string): boolean {
  const segments = command.split(/\|\||&&|[|;&]/);
  for (const seg of segments) {
    const tokens = seg.trim().split(/\s+/).filter(Boolean);
    let index = 0;
    // Skip leading `VAR=value` assignments and wrapper commands.
    while (index < tokens.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index]) || WRAPPERS.has(basename(tokens[index])))) {
      index++;
    }
    const first = tokens[index];
    if (first && INTERACTIVE_PROGRAMS.has(basename(first))) return true;
  }
  return false;
}
