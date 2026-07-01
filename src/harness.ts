// The embeddable AI coding harnesses, mapped to the binary that launches each. In the web app a
// harness runs in a PTY rendered as an inline terminal card (see src/server/controller.ts).
export const HARNESS_COMMANDS: Record<string, string> = {
  claude: 'claude',
  opencode: 'opencode',
  codex: 'codex',
};

export const HARNESS_NAMES = Object.keys(HARNESS_COMMANDS);

export type HarnessParsed = { name: string; workspace: boolean; label?: string } | { error: string };

/**
 * Parse a `harness <name> [as <label>] [-w|--workspace]` command, validating the harness name
 * against the known set. `as <label>` gives the new tab a custom label instead of the harness
 * name (still de-duplicated against existing tab labels).
 */
export function parseHarnessCommand(input: string): HarnessParsed {
  const rest = input.replace(/^harness\b\s*/i, '').trim();
  if (!rest) return { error: `Usage: harness <${HARNESS_NAMES.join('|')}> [as <label>] [-w].` };
  const tokens = rest.split(/\s+/);
  const name = tokens[0].toLowerCase();
  if (HARNESS_COMMANDS[name] === undefined) {
    return { error: `Unknown harness "${name}". Choose from: ${HARNESS_NAMES.join(', ')}.` };
  }
  const rest_ = tokens.slice(1);
  const workspace = rest_.some((t) => t === '-w' || t === '--workspace');
  const asIndex = rest_.findIndex((t) => t.toLowerCase() === 'as');
  if (asIndex === -1) return { name, workspace };
  const label = rest_[asIndex + 1];
  if (!label) return { error: `Usage: harness <${HARNESS_NAMES.join('|')}> as <label>.` };
  return { name, workspace, label };
}
