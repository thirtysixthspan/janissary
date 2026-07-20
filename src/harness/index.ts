// The embeddable AI coding harnesses, mapped to the binary that launches each. In the web app a
// harness runs in a PTY rendered as an inline terminal card (see src/server/controller.ts).
export const HARNESS_COMMANDS: Record<string, string> = {
  claude: 'claude',
  opencode: 'opencode',
  codex: 'codex',
};

export const HARNESS_NAMES = Object.keys(HARNESS_COMMANDS);

export type { HarnessParsed } from './command-parse.js';
export { parseHarnessCommand } from './command-parse.js';

// Single-quote a value for embedding in a `shell -lc '<command>'` string, escaping any embedded
// single quotes (`'` → `'\''`).
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", String.raw`'\''`)}'`;
}

// Each harness expresses a per-session effort/reasoning level through a different flag, so the same
// requested level maps to different arguments: claude takes `--effort <level>`; codex sets it via a
// config override (`-c model_reasoning_effort=<level>`); opencode has no effort flag at all and gets
// nothing. Passing claude's `--effort` to codex or opencode makes the binary reject the unknown
// argument and exit immediately, closing the freshly opened harness tab.
function effortArg(name: string, effort: string): string | undefined {
  if (name === 'claude') return `--effort ${shellQuote(effort)}`;
  if (name === 'codex') return `-c ${shellQuote(`model_reasoning_effort=${effort}`)}`;
  return undefined;
}

// Build the shell command string that launches a harness binary, optionally with a model and/or an
// effort level translated to that harness's own flag (see effortArg).
// `buildHarnessCommand('codex', 'gpt-5', 'high')` → `codex --model 'gpt-5' -c 'model_reasoning_effort=high'`.
export function buildHarnessCommand(name: string, model?: string, effort?: string): string {
  const program = HARNESS_COMMANDS[name];
  const parts = [program];
  if (model) parts.push(`--model ${shellQuote(model)}`);
  const effortFlag = effort ? effortArg(name, effort) : undefined;
  if (effortFlag) parts.push(effortFlag);
  return parts.join(' ');
}
