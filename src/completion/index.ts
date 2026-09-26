import type { CompletionResult } from './types.js';
import {
  completeMonitorCommand, completeSearchCommand, completeSyntaxTheme, completeHarnessModel,
  type MonitorCompletions,
} from './handlers.js';
import {
  completeAgentName, completeSendTarget, completeScheduleTarget, completeConnectionClose,
} from './target-handlers.js';
import { completeBrowserCommand } from './browser.js';
import { completeFilePath } from './fs.js';
import { readCompletionCursor } from './cursor.js';
import { SYNTAX_THEMES } from '../syntax-themes.js';

/**
 * Tab-complete the token ending at the cursor.
 *
 * - For the recipient argument of `msg`/`broadcast`, completes against open tab labels
 *   (`broadcast` also offers `all` and supports a comma-separated list).
 * - For the target argument of `send`, `queue`, `close`/`exit`, and the `in <tab>` clause of
 *   `schedule`, completes against all open tab labels.
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
  cursorOffset: number,
  cwd: string,
  labels: string[] = [],
  connections: string[] = [],
  monitor?: MonitorCompletions,
): CompletionResult {
  const cursor = readCompletionCursor(input, cursorOffset);
  const result = completeAgentName(cursor, labels) ??
    completeSendTarget(cursor, labels) ??
    completeScheduleTarget(cursor, labels) ??
    completeConnectionClose(cursor, connections) ??
    completeBrowserCommand(cursor, connections) ??
    completeMonitorCommand(cursor, monitor) ??
    completeSearchCommand(cursor) ??
    completeSyntaxTheme(cursor, SYNTAX_THEMES) ??
    completeHarnessModel(cursor);
  return result ?? completeFilePath(cursor, cwd);
}
