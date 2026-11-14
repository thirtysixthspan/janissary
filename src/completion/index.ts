import type { CompletionResult } from './types.js';
import {
  completeHelpCommand, completeMonitorCommand, completeSearchCommand, completeSyntaxTheme, completeHarnessModel,
  completeLayoutCommand,
  type MonitorCompletions,
} from './handlers.js';
import {
  completeSendTarget, completeScheduleTarget, completeConnectionClose, completeTabCommand,
} from './target-handlers.js';
import { completeBrowserCommand } from './browser.js';
import { completeFilePath } from './fs.js';
import { readCompletionCursor } from './cursor.js';
import { completeApplicationCommandName } from './command-names.js';
import { ALL_ENABLED_POLICY, type CompletionPolicy } from './command-policy.js';
import { unchanged } from './candidates.js';
import { SYNTAX_THEMES } from '../syntax-themes.js';
import { completeSystemSchedule, type SystemScheduleCompletions } from './system-schedule.js';
import { completeRunscriptCommand } from './runscript-commands.js';
import { completeFilesCommand, type FilesCompletions } from './files.js';
import { completeFileReadCommand } from './file-read.js';
import { listHelpPages } from '../help-pages.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HELP_DIRECTORY = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'help');

/**
 * Tab-complete the token ending at the cursor.
 *
 * - For tab-target arguments of `send`, `queue`, `close`/`exit`, `schedule`, and `tab`, completes
 *   against open tab labels and display titles.
 * - For the target of `connections close`, completes against open connection strings
 *   (e.g. `sqlite:movies`, `shell:bash`, `acp:opencode`, `browser:w1`).
 * - For the `browser` command, completes subcommands and, where a window id is expected
 *   (`browser use`, `browser window close`), the current tab's open window ids.
 * - At the start of a line, completes enabled application command names and aliases before
 *   filesystem paths. Disabled commands and their arguments are not completed.
 * - For `file read`, completes the subcommand, its flags, and paths against `fileReadRoot`, the
 *   root the read resolves against; with no root (a remote tab) it offers no paths.
 * - For `file glob`, completes the subcommand, its flags, and directory names after `--path`
 *   against `fileReadRoot`; with no root (a remote tab) it offers no directories.
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
  systemSchedule?: SystemScheduleCompletions,
  files?: FilesCompletions,
  modelsFor?: (harness: string) => string[],
  policy: CompletionPolicy = ALL_ENABLED_POLICY,
  fileReadRoot?: string,
): CompletionResult {
  const cursor = readCompletionCursor(input, cursorOffset);
  const prefix = cursor.preceding.join(' ');
  if (!prefix.startsWith('!') && !policy.allows(prefix)) return unchanged(cursor);
  const result = completeApplicationCommandName(cursor, policy, cwd) ??
    completeFilesCommand(cursor, files, cwd) ??
    completeSendTarget(cursor, labels) ??
    completeTabCommand(cursor, labels) ??
    completeRunscriptCommand(cursor, cwd, systemSchedule?.scripts ?? []) ??
    completeSystemSchedule(cursor, systemSchedule) ??
    completeScheduleTarget(cursor, labels) ??
    completeConnectionClose(cursor, connections) ??
    completeBrowserCommand(cursor, connections, policy) ??
    completeMonitorCommand(cursor, monitor) ??
    completeHelpCommand(
      cursor,
      cursor.command === 'help' && cursor.argumentIndex === 1 ? listHelpPages(HELP_DIRECTORY) : [],
    ) ??
    completeSearchCommand(cursor) ??
    completeSyntaxTheme(cursor, SYNTAX_THEMES) ??
    completeLayoutCommand(cursor) ??
    completeFileReadCommand(cursor, fileReadRoot, policy) ??
    (modelsFor ? completeHarnessModel(cursor, modelsFor) : null);
  return result ?? completeFilePath(cursor, cwd);
}
