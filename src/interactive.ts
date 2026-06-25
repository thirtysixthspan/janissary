import * as pty from 'node-pty';
import type { InteractiveSession, RunInteractiveOptions } from './types.js';

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

/**
 * Run a command in a pseudo-terminal so it sees a real TTY. Output is delivered
 * via onData (caller pipes it to the real stdout); call write() to forward keystrokes.
 */
export function runInteractive(options: RunInteractiveOptions): InteractiveSession {
  const shell = process.env.SHELL || 'bash';
  const proc = pty.spawn(shell, ['-c', options.cmd], {
    name: 'xterm-256color',
    cols: Math.max(1, options.cols),
    rows: Math.max(1, options.rows),
    cwd: options.cwd || process.cwd(),
    env: process.env,
  });

  proc.onData(options.onData);
  proc.onExit(({ exitCode }) => options.onExit(exitCode));

  return {
    write: (data) => proc.write(data),
    resize: (cols, rows) => {
      try { proc.resize(Math.max(1, cols), Math.max(1, rows)); } catch { /* process may have exited */ }
    },
    kill: () => {
      try { proc.kill(); } catch { /* already gone */ }
    },
  };
}
