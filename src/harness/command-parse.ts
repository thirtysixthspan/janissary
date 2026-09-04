import { HARNESS_COMMANDS, HARNESS_NAMES } from './index.js';
import { supportsHarnessAutoApprove } from './auto-approve.js';
import { parseRemoteAddress, type RemoteAddress } from '../remote/address.js';

// The `harness` command's parsing, split out of index.ts: a distinct concern from the
// shell-command-string building (shellQuote/buildHarnessCommand) that remains there.

export type HarnessParsed =
  | {
    name: string; workspace: boolean; offline: boolean; autoApprove: boolean; browser: boolean;
    label?: string; model?: string; effort?: string; prompt?: string; remote?: RemoteAddress;
  }
  | { capture: true; label: string }
  | { transcript: true; label: string }
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

// Find an `on <address>` clause among `tokens` and parse the address that follows it. Returns
// undefined when the clause is absent, or an `{ error }` when it is present with no address or with
// an address outside the allowed character set. Kept beside `findFlagValue` rather than inlined into
// `parseHarnessFlags`, which already carries five flags plus `as` and sits near the cognitive
// complexity limit the file was previously split to respect.
function findRemoteClause(tokens: string[]): RemoteAddress | undefined | { error: string } {
  const index = tokens.findIndex((t) => t.toLowerCase() === 'on');
  if (index === -1) return undefined;
  return parseRemoteAddress(tokens[index + 1]);
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

// Parse the option flags following the harness name: workspace and auto-approve opt-ins/outs, --offline,
// -b/--browser, --model <name>, --effort <level>, `on <address>`, and a trailing `as <label>`. Split
// out of `parseHarnessCommand` so that function's own branching stays under the complexity limit.
// A present `on` forces `workspace` true, so no caller has to remember the implication: the remote
// server does nothing but workspaced launches, so a remote launch without one has no meaning.
function parseHarnessFlags(
  tokens: string[],
  name: string,
): {
  workspace: boolean; offline: boolean; autoApprove: boolean; browser: boolean;
  model?: string; effort?: string; label?: string; remote?: RemoteAddress;
} | { error: string } {
  const remote = findRemoteClause(tokens);
  if (remote !== undefined && 'error' in remote) return remote;
  const noWorkspace = tokens.some((t) => t.toLowerCase() === '--no-workspace');
  const workspace = remote !== undefined || !noWorkspace;
  const offline = tokens.some((t) => t.toLowerCase() === '--offline');
  const browser = tokens.some((t) => t === '-b' || t.toLowerCase() === '--browser');
  const noAutoApprove = tokens.some((t) => t.toLowerCase() === '--no-auto-approve');
  const requestedAutoApprove = tokens.some((t) => t === '-y' || t === '--yes');
  const autoApprove = supportsHarnessAutoApprove(name) && !noAutoApprove;
  // The supported-harness check comes first: adding -w would not make `harness opencode -y` valid,
  // so pointing at -w would misdirect — the harness choice is the real blocker.
  if (requestedAutoApprove && !noAutoApprove && !supportsHarnessAutoApprove(name)) {
    return { error: '-y/--yes is only supported for the claude and codex harnesses.' };
  }
  const model = findFlagValue(tokens, '--model');
  if (model !== undefined && typeof model !== 'string') return model;
  const effort = findFlagValue(tokens, '--effort');
  if (effort !== undefined && typeof effort !== 'string') return effort;
  const asIndex = tokens.findIndex((t) => t.toLowerCase() === 'as');
  if (asIndex === -1) return { workspace, offline, autoApprove, browser, model, effort, remote };
  const label = tokens[asIndex + 1];
  if (!label) return { error: `Usage: harness <${HARNESS_NAMES.join('|')}> as <label>.` };
  return { workspace, offline, autoApprove, browser, model, effort, label, remote };
}

// The `harness <subcommand> <label>` forms, which target an existing harness tab instead of
// launching one. Both share a shape, so they parse through one branch — keeping
// `parseHarnessCommand`'s own branching under the complexity limit and the usage string singular.
// Returns undefined when the first token is not one of them.
function parseLabelSubcommand(tokens: string[]): HarnessParsed | undefined {
  const subcommand = tokens[0].toLowerCase();
  if (subcommand !== 'capture' && subcommand !== 'transcript') return undefined;
  const label = tokens[1];
  if (!label) return { error: `Usage: harness ${subcommand} <name>.` };
  return subcommand === 'capture' ? { capture: true, label } : { transcript: true, label };
}

/**
 * Parse a `harness <name> [as <label>] [on <address>] [-w|--workspace] [--offline] [-y|--yes]
 * [-b|--browser] [--model <name>] [--effort <level>]` command, validating the harness name against
 * the known set.
 * `on <address>` runs the harness on another host over one ssh session and implies `-w`, since the
 * remote server does nothing but workspaced launches (see `product/specs/remote-server.md`).
 * `as <label>`
 * gives the new tab a custom label instead of the harness name (still de-duplicated against
 * existing tab labels). `--offline` adds a network-deny rule to the tab's sandbox profile (only
 * meaningful alongside `-w`/`--workspace`). `-y`/`--yes` auto-approves the harness's own permission
 * prompts; it is supported for claude and codex (a hard error otherwise) and works with or without `-w`/`--workspace` —
 * without a workspace, the new tab's terminal shows a security warning since prompts are then
 * approved unattended against the real working directory, with no sandbox.
 * `-b`/`--browser` starts a headless Chromium for the tab and injects the two variables a sandboxed
 * AI drives it through (see `product/specs/harness.md`). It is accepted for every harness, with or
 * without a workspace, and is deliberately not rejected alongside `--offline`: both apply, and the
 * offline profile then denies the harness the network route to its own browser.
 * `--model <name>` selects a model, validated by the caller against the harness's catalog.
 * `--effort <level>` selects an effort level, passed through verbatim with no validation.
 * A trailing `with <prompt>` clause (after all options) carries free-text to inject into the new
 * harness once it is running; everything after the standalone `with` token to end of line is the
 * prompt, with internal spaces preserved verbatim. A `with` with no following text is a usage error.
 * `harness capture <name>` and `harness transcript <name>` are the other forms: `<name>` targets an
 * existing harness tab by label (neither keyword can collide with a harness name — neither is a
 * HARNESS_COMMANDS key).
 */
export function parseHarnessCommand(input: string): HarnessParsed {
  const rest = input.replace(/^harness\b\s*/i, '').trim();
  if (!rest) return { error: `Usage: harness <${HARNESS_NAMES.join('|')}> [as <label>] [-w] [-y].` };
  const clause = splitWithClause(rest);
  if ('error' in clause) return clause;
  const { left, prompt } = clause;
  const tokens = left.split(/\s+/);
  const subcommand = parseLabelSubcommand(tokens);
  if (subcommand) return subcommand;
  const name = tokens[0].toLowerCase();
  if (HARNESS_COMMANDS[name] === undefined) {
    return { error: `Unknown harness "${name}". Choose from: ${HARNESS_NAMES.join(', ')}.` };
  }
  const flags = parseHarnessFlags(tokens.slice(1), name);
  if ('error' in flags) return flags;
  return { name, ...flags, prompt };
}
