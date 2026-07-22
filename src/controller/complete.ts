import { completeCommandLine } from '../completion/index.js';
import { listPersonas } from '../personas.js';
import type { CompletionResult } from '../types.js';
import type { Managers } from '../managers.js';

// Tab-completion for the command line (reuses the shared `completeCommandLine`): filesystem
// paths against the active tab's cwd, `msg`/`broadcast` agent names, `connection close` targets,
// and `browser` subcommands / window ids. Extracted from `controller.ts` to keep it under the
// file-size limit — see `ai/guidelines/code-guidelines.md`.
export function complete(managers: Managers, text: string, cursor: number): CompletionResult {
  const tab = managers.tab.cur();
  const cwd = managers.tab.cwdOf(tab.label) ?? process.cwd();
  const agents = managers.tab.allLabels();
  // Monitor targets: every other action tab, plus `group:<n>` for each existing group.
  const actionTabs = managers.tab.tabs.filter((t) => t.view !== 'monitor');
  const groups = [...new Set(actionTabs.map((t) => t.group))].toSorted((a, b) => a - b).map((g) => `group:${g}`);
  const targets = [...actionTabs.map((t) => t.label).filter((l) => l !== tab.label), ...groups];
  return completeCommandLine(
    text, cursor, cwd, agents, managers.connection.completionConnections(tab.label),
    { personas: listPersonas(), targets },
  );
}
