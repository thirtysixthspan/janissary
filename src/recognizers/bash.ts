import { FUNCTION_WORDS } from './lexicon.js';
import type { CommandRecognizer } from './types.js';

// Common executables/builtins that strongly signal a shell command when they lead the line.
const COMMON_COMMANDS = new Set([
  'ls', 'cd', 'pwd', 'cat', 'echo', 'printf', 'grep', 'egrep', 'fgrep', 'rg', 'find', 'head',
  'tail', 'less', 'more', 'touch', 'rm', 'rmdir', 'cp', 'mv', 'mkdir', 'chmod', 'chown', 'ln',
  'ps', 'kill', 'top', 'htop', 'df', 'du', 'tar', 'gzip', 'gunzip', 'zip', 'unzip', 'curl',
  'wget', 'ssh', 'scp', 'rsync', 'git', 'npm', 'npx', 'node', 'yarn', 'pnpm', 'deno', 'bun',
  'python', 'python3', 'pip', 'pip3', 'ruby', 'gem', 'go', 'cargo', 'rustc', 'make', 'cmake',
  'sed', 'awk', 'sort', 'uniq', 'wc', 'cut', 'tr', 'xargs', 'tee', 'date', 'whoami', 'which',
  'env', 'export', 'unset', 'source', 'sleep', 'history', 'man', 'ping', 'brew', 'apt', 'yum',
  'docker', 'kubectl', 'code', 'vim', 'nano', 'emacs', 'open', 'say', 'jq', 'sqlite3', 'psql',
  'mysql', 'test', 'true', 'false', 'set', 'alias', 'jobs', 'bg', 'fg', 'nohup', 'time',
]);

// Commands that are also everyday English words, so a sentence can plausibly start with one
// ("find the largest file", "which file is longest"). For these, a prose-looking line is treated
// as a natural-language prompt rather than a shell invocation.
const AMBIGUOUS_COMMANDS = new Set([
  'which', 'find', 'make', 'test', 'set', 'time', 'date', 'open', 'say', 'help', 'sort', 'do',
  'who', 'head', 'tail', 'last', 'touch', 'kill', 'cut', 'less', 'more', 'top', 'tee',
]);

// Shell metacharacters: pipes, redirects, chaining, command substitution, env refs. A bare `*`
// is deliberately excluded — it is weak evidence of a shell command and collides with SQL (`SELECT *`).
const SHELL_OPERATORS = /[|&;<>`]|\$\(|\$\{|\$[A-Za-z_]/;
const PATH_LIKE = /^(\.{1,2}\/|\/|~\/)/;
const FLAG = /^-{1,2}[A-Za-z]/;

// Recognize a shell/bash command. Leading with a known command is the strongest signal; shell
// operators or an explicit executable path also count. A command word doubling as English
// ("which", "find", …) at the head of a prose sentence is discounted so it routes to the agent.
export const bashRecognizer: CommandRecognizer = {
  route: 'shell',
  recognize: (cmd) => {
    const trimmed = cmd.trim();
    const tokens = trimmed.split(/\s+/);
    const first = (tokens[0] ?? '').toLowerCase();
    const proseWords = tokens.slice(1).filter((t) => FUNCTION_WORDS.has(t.toLowerCase())).length;
    const looksProse = tokens.length >= 3 && proseWords >= 1;

    let score = 0;
    if (COMMON_COMMANDS.has(first)) {
      score = AMBIGUOUS_COMMANDS.has(first) && looksProse ? 0.25 : 0.9;
    } else if (PATH_LIKE.test(first)) {
      score = 0.85;
    }

    if (SHELL_OPERATORS.test(trimmed)) score = Math.max(score, 0.6) + 0.1;
    if (tokens.length > 1 && FLAG.test(tokens[1])) score += 0.05;

    score = Math.min(score, 0.98);
    return { match: score >= 0.5, reliability: score };
  },
};
