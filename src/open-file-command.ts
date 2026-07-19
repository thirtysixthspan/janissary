import path from 'node:path';
import { isGlobPattern, parseOpen } from './commands/open.js';
import { expandUserPath } from './paths.js';
import { webOpener } from './openers/page.js';
import type { OpenContext } from './openers/index.js';
import type { Managers } from './managers.js';
import { TabManager } from './tab/manager.js';

// OpenFileManager.run, extracted whole: resolves an `open <target>` command to a web URL, an
// expanded glob, or a single path, and dispatches each to its opener. `expandGlob` — the one
// piece of this flow that shells out — stays the caller's, passed through as an opaque callback
// so this module never itself touches shell execution.
export function runOpenCommand(
  managers: Managers, command: string, label: string,
  buildContext: (command: string, label: string) => OpenContext,
  expandGlob: (pattern: string, cwd: string) => string[],
  openOne: (command: string, label: string, file: string, external: boolean, context: OpenContext) => void,
): void {
  const parsed = parseOpen(command);
  if ('error' in parsed) { managers.tab.append(label, { input: command, output: parsed.error }); return; }
  const cwd = managers.tab.cwdOf(label) ?? process.cwd();
  const context = buildContext(command, label);
  const target = expandUserPath(parsed.target, { root: managers.tab.launchDir });

  if (parsed.web) {
    void (parsed.external ? webOpener.external(target, context) : webOpener.inline(target, context));
    return;
  }

  if (isGlobPattern(target)) {
    const matches = expandGlob(target, cwd);
    if (matches.length === 0) { managers.tab.append(label, { input: command, output: `open: ${target}: no matching files` }); return; }
    const files = matches.slice(0, TabManager.OPEN_MAX_FILES);
    if (matches.length > files.length) {
      managers.tab.append(label, { input: command, output: `Opening the first ${files.length} of ${matches.length} matching files.` });
    }
    for (const file of files) openOne(command, label, file, parsed.external, context);
    return;
  }

  const file = path.isAbsolute(target) ? target : path.resolve(cwd, target);
  openOne(command, label, file, parsed.external, context);
}
