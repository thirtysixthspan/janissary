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

// Build the shell command string that launches a harness binary, optionally with a model and/or
// effort flag. `buildHarnessCommand('opencode', 'opencode-go/deepseek-v4-pro', 'high')` →
// `opencode --model 'opencode-go/deepseek-v4-pro' --effort 'high'`.
export function buildHarnessCommand(name: string, model?: string, effort?: string): string {
  const program = HARNESS_COMMANDS[name];
  const parts = [program];
  if (model) parts.push(`--model ${shellQuote(model)}`);
  if (effort) parts.push(`--effort ${shellQuote(effort)}`);
  return parts.join(' ');
}
