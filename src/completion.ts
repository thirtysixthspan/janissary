import type { CompletionResult } from './types.js';
import { completeAgentName, completeSendTarget, completeScheduleTarget, completeConnectionClose, completeBrowserCommand, completeMonitorCommand, completeSearchCommand, completeSyntaxTheme } from './completion-handlers.js';
import { completeFilePath } from './completion-fs.js';
import { SYNTAX_THEMES } from './syntax-themes.js';

/**
 * Tab-complete the token ending at the cursor.
 *
 * - For the recipient argument of `msg`/`broadcast`, completes against active agent names
 *   (`broadcast` also offers `all` and supports a comma-separated list).
 * - For the target argument of `send` and the `in <tab>` clause of `schedule`, completes
 *   against all open tab labels.
 * - For the target of `connection close`, completes against open connection strings
 *   (e.g. `sqlite:movies`, `shell:bash`, `acp:opencode`, `browser:w1`).
 * - For the `browser` command, completes subcommands and, where a window id is expected
 *   (`browser use`, `browser window close`), the current tab's open window ids.
 * - Otherwise completes a filesystem path relative to `cwd`.
 *
 * A single match is filled in fully; multiple matches fill in their longest common prefix
 * and are returned via `matches` so the caller can display the options.
 */
export function completeCommandLine(
  input: string,
  cursor: number,
  cwd: string,
  agents: string[] = [],
  connections: string[] = [],
  monitor?: { personas: string[]; targets: string[] },
): CompletionResult {
  const before = input.slice(0, cursor);
  const after = input.slice(cursor);
  const tokenStart = Math.max(before.lastIndexOf(' '), before.lastIndexOf('\t')) + 1;
  const token = before.slice(tokenStart);

  // Determine the command word and which argument position the cursor is in.
  const preceding = before.slice(0, tokenStart).trim().split(/\s+/).filter(Boolean);
  const command = preceding[0]?.replace(/^\//, '').toLowerCase();
  const argumentIndex = preceding.length;

  // Try command-specific handlers.
  const result = completeAgentName(command, argumentIndex, token, agents, before, after, tokenStart) ??
    completeSendTarget(command, argumentIndex, token, agents, before, after, tokenStart) ??
    completeScheduleTarget(command, argumentIndex, preceding, token, agents, before, after, tokenStart) ??
    completeConnectionClose(command, argumentIndex, preceding, token, connections, before, after, tokenStart) ??
    completeBrowserCommand(command, argumentIndex, preceding, token, connections, before, after, tokenStart) ??
    completeMonitorCommand(command, argumentIndex, preceding, token, monitor, before, after, tokenStart) ??
    completeSearchCommand(command, argumentIndex, token, before, after, tokenStart) ??
    completeSyntaxTheme(command, argumentIndex, preceding, token, SYNTAX_THEMES, before, after, tokenStart);
  if (result !== null) {
    return result;
  }

  return completeFilePath(token, cwd, before, after, tokenStart, input, cursor);
}
