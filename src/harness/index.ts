// The embeddable AI coding harnesses, mapped to the binary that launches each. In the web app a
// harness runs in a PTY rendered as an inline terminal card (see src/controller.ts).
export const HARNESS_COMMANDS: Record<string, string> = {
  claude: 'claude',
  opencode: 'opencode',
  codex: 'codex',
};

export const HARNESS_NAMES = Object.keys(HARNESS_COMMANDS);

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

// codex (0.157+) runs interactive sessions through a shared, long-lived background server by
// default: the first TUI spawns it and records it with `ps`, and later ones hand their session to it
// over a socket under `~/.codex`. Inside the workspace sandbox the `ps` call fails outright — it is
// setuid, which Seatbelt refuses to execute — and the hand-off would be worse if it worked: a
// workspaced session would run inside a server another, unconfined codex started, with that
// process's environment and credentials instead of its own tab's. `--no-daemon` keeps each tab's
// session in its own process. It is probed rather than passed outright because older codex releases
// reject the unknown flag and exit; the command runs through the user's shell, so the substitution
// asks the same binary the launch resolves, on whichever host the launch runs, and expands to
// nothing when the flag is absent.
const LAUNCH_ARGS: Record<string, string> = {
  codex: '$(codex --help 2>/dev/null | grep -q -e --no-daemon && echo --no-daemon)',
};

// Build the shell command string that launches a harness binary, optionally with a model and/or an
// effort level translated to that harness's own flag (see effortArg).
// `buildHarnessCommand('codex', 'gpt-5', 'high')` →
// `codex $(…probe…) --model 'gpt-5' -c 'model_reasoning_effort=high'` (see LAUNCH_ARGS).
export function buildHarnessCommand(name: string, model?: string, effort?: string): string {
  const program = HARNESS_COMMANDS[name];
  const parts = [program];
  const launchArgs = LAUNCH_ARGS[name];
  if (launchArgs) parts.push(launchArgs);
  if (model) parts.push(`--model ${shellQuote(model)}`);
  const effortFlag = effort ? effortArg(name, effort) : undefined;
  if (effortFlag) parts.push(effortFlag);
  return parts.join(' ');
}
