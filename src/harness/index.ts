// The embeddable AI coding harnesses, mapped to the binary that launches each. In the web app a
// harness runs in a PTY rendered as an inline terminal card (see src/server/controller.ts).
export const HARNESS_COMMANDS: Record<string, string> = {
  claude: 'claude',
  opencode: 'opencode',
  codex: 'codex',
};

export const HARNESS_NAMES = Object.keys(HARNESS_COMMANDS);

export type HarnessParsed =
  | { name: string; workspace: boolean; offline: boolean; autoApprove: boolean; label?: string; model?: string; effort?: string }
  | { capture: true; label: string }
  | { error: string };

// Find a `--flag <value>` pair anywhere in `tokens`. Returns the value, `undefined` if the flag
// isn't present, or an error string if the flag is present with no following value.
function findFlagValue(tokens: string[], flag: string): string | undefined | { error: string } {
  const index = tokens.findIndex((t) => t.toLowerCase() === flag);
  if (index === -1) return undefined;
  const value = tokens[index + 1];
  if (!value) return { error: `Usage: harness <${HARNESS_NAMES.join('|')}> ${flag} <value>.` };
  return value;
}

/**
 * Parse a `harness <name> [as <label>] [-w|--workspace] [--offline] [-y|--yes] [--model <name>]
 * [--effort <level>]` command, validating the harness name against the known set. `as <label>`
 * gives the new tab a custom label instead of the harness name (still de-duplicated against
 * existing tab labels). `--offline` adds a network-deny rule to the tab's sandbox profile (only
 * meaningful alongside `-w`/`--workspace`). `-y`/`--yes` auto-approves the harness's own permission
 * prompts; it is claude-only and requires `-w`/`--workspace` (both are hard errors otherwise).
 * `--model <name>` selects a model, validated by the caller against the harness's catalog.
 * `--effort <level>` selects an effort level, passed through verbatim with no validation.
 * `harness capture <name>` is the other form: `<name>` targets an existing harness tab by label
 * (`capture` can never collide with a harness name — it is not a HARNESS_COMMANDS key).
 */
export function parseHarnessCommand(input: string): HarnessParsed {
  const rest = input.replace(/^harness\b\s*/i, '').trim();
  if (!rest) return { error: `Usage: harness <${HARNESS_NAMES.join('|')}> [as <label>] [-w] [-y].` };
  const tokens = rest.split(/\s+/);
  if (tokens[0].toLowerCase() === 'capture') {
    const label = tokens[1];
    if (!label) return { error: 'Usage: harness capture <name>.' };
    return { capture: true, label };
  }
  const name = tokens[0].toLowerCase();
  if (HARNESS_COMMANDS[name] === undefined) {
    return { error: `Unknown harness "${name}". Choose from: ${HARNESS_NAMES.join(', ')}.` };
  }
  const rest_ = tokens.slice(1);
  const workspace = rest_.some((t) => t === '-w' || t === '--workspace');
  const offline = rest_.some((t) => t.toLowerCase() === '--offline');
  const autoApprove = rest_.some((t) => t === '-y' || t === '--yes');
  // Claude-only comes first: adding -w would not make `harness opencode -y` valid, so pointing at
  // -w would misdirect — the harness choice is the real blocker.
  if (autoApprove && name !== 'claude') return { error: '-y/--yes is only supported for the claude harness.' };
  if (autoApprove && !workspace) return { error: '-y/--yes requires -w/--workspace: auto-approval is only allowed in a sandboxed workspace.' };
  const model = findFlagValue(rest_, '--model');
  if (model !== undefined && typeof model !== 'string') return model;
  const effort = findFlagValue(rest_, '--effort');
  if (effort !== undefined && typeof effort !== 'string') return effort;
  const asIndex = rest_.findIndex((t) => t.toLowerCase() === 'as');
  if (asIndex === -1) return { name, workspace, offline, autoApprove, model, effort };
  const label = rest_[asIndex + 1];
  if (!label) return { error: `Usage: harness <${HARNESS_NAMES.join('|')}> as <label>.` };
  return { name, workspace, offline, autoApprove, model, effort, label };
}

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
