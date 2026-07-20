import { HARNESS_COMMANDS, HARNESS_NAMES } from './index.js';

// The `harness` command's parsing, split out of index.ts: a distinct concern from the
// shell-command-string building (shellQuote/buildHarnessCommand) that remains there.

export type HarnessParsed =
  | { name: string; workspace: boolean; offline: boolean; autoApprove: boolean; label?: string; model?: string; effort?: string; prompt?: string }
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

// Split a trailing `with <prompt>` clause off the harness command's argument string, before any
// option parsing so flag-like words inside the prompt are never scanned as options. Returns the
// options portion (`left`) plus the verbatim prompt when a standalone `with` token is present, an
// `error` when `with` has no following text, or just `left` when there is no clause.
function splitWithClause(rest: string): { left: string; prompt?: string } | { error: string } {
  const withMatch = /\bwith\b/i.exec(rest);
  if (!withMatch) return { left: rest };
  const prompt = rest.slice(withMatch.index + withMatch[0].length).trim();
  if (!prompt) return { error: `Usage: harness <${HARNESS_NAMES.join('|')}> [options] with <prompt>.` };
  return { left: rest.slice(0, withMatch.index).trim(), prompt };
}

// Parse the option flags following the harness name: -w/--workspace, --offline, -y/--yes,
// --model <name>, --effort <level>, and a trailing `as <label>`. Split out of
// `parseHarnessCommand` so that function's own branching stays under the complexity limit.
function parseHarnessFlags(
  tokens: string[],
  name: string,
): { workspace: boolean; offline: boolean; autoApprove: boolean; model?: string; effort?: string; label?: string } | { error: string } {
  const workspace = tokens.some((t) => t === '-w' || t === '--workspace');
  const offline = tokens.some((t) => t.toLowerCase() === '--offline');
  const autoApprove = tokens.some((t) => t === '-y' || t === '--yes');
  // Claude-only comes first: adding -w would not make `harness opencode -y` valid, so pointing at
  // -w would misdirect — the harness choice is the real blocker.
  if (autoApprove && name !== 'claude') return { error: '-y/--yes is only supported for the claude harness.' };
  const model = findFlagValue(tokens, '--model');
  if (model !== undefined && typeof model !== 'string') return model;
  const effort = findFlagValue(tokens, '--effort');
  if (effort !== undefined && typeof effort !== 'string') return effort;
  const asIndex = tokens.findIndex((t) => t.toLowerCase() === 'as');
  if (asIndex === -1) return { workspace, offline, autoApprove, model, effort };
  const label = tokens[asIndex + 1];
  if (!label) return { error: `Usage: harness <${HARNESS_NAMES.join('|')}> as <label>.` };
  return { workspace, offline, autoApprove, model, effort, label };
}

/**
 * Parse a `harness <name> [as <label>] [-w|--workspace] [--offline] [-y|--yes] [--model <name>]
 * [--effort <level>]` command, validating the harness name against the known set. `as <label>`
 * gives the new tab a custom label instead of the harness name (still de-duplicated against
 * existing tab labels). `--offline` adds a network-deny rule to the tab's sandbox profile (only
 * meaningful alongside `-w`/`--workspace`). `-y`/`--yes` auto-approves the harness's own permission
 * prompts; it is claude-only (a hard error otherwise) and works with or without `-w`/`--workspace` —
 * without a workspace, the new tab's terminal shows a security warning since prompts are then
 * approved unattended against the real working directory, with no sandbox.
 * `--model <name>` selects a model, validated by the caller against the harness's catalog.
 * `--effort <level>` selects an effort level, passed through verbatim with no validation.
 * A trailing `with <prompt>` clause (after all options) carries free-text to inject into the new
 * harness once it is running; everything after the standalone `with` token to end of line is the
 * prompt, with internal spaces preserved verbatim. A `with` with no following text is a usage error.
 * `harness capture <name>` is the other form: `<name>` targets an existing harness tab by label
 * (`capture` can never collide with a harness name — it is not a HARNESS_COMMANDS key).
 */
export function parseHarnessCommand(input: string): HarnessParsed {
  const rest = input.replace(/^harness\b\s*/i, '').trim();
  if (!rest) return { error: `Usage: harness <${HARNESS_NAMES.join('|')}> [as <label>] [-w] [-y].` };
  const clause = splitWithClause(rest);
  if ('error' in clause) return clause;
  const { left, prompt } = clause;
  const tokens = left.split(/\s+/);
  if (tokens[0].toLowerCase() === 'capture') {
    const label = tokens[1];
    if (!label) return { error: 'Usage: harness capture <name>.' };
    return { capture: true, label };
  }
  const name = tokens[0].toLowerCase();
  if (HARNESS_COMMANDS[name] === undefined) {
    return { error: `Unknown harness "${name}". Choose from: ${HARNESS_NAMES.join(', ')}.` };
  }
  const flags = parseHarnessFlags(tokens.slice(1), name);
  if ('error' in flags) return flags;
  return { name, ...flags, prompt };
}
