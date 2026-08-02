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
export async function runOpenCommand(
  managers: Managers, command: string, label: string,
  buildContext: (command: string, label: string) => OpenContext,
  expandGlob: (pattern: string, cwd: string) => string[],
  openOne: OpenOne,
): Promise<void> {
  const parsed = parseOpen(command);
  if ('error' in parsed) { managers.tab.append(label, { input: command, output: parsed.error }); return; }
  const cwd = managers.tab.cwdOf(label) ?? process.cwd();
  const context = buildContext(command, label);
  const target = expandUserPath(parsed.target, { root: managers.tab.launchDir });

  if (parsed.web) {
    await (parsed.external ? webOpener.external(target, context) : webOpener.inline(target, context));
    return;
  }

  const files = isGlobPattern(target)
    ? globFiles(managers, command, label, target, expandGlob(target, cwd))
    : [path.isAbsolute(target) ? target : path.resolve(cwd, target)];

  // Sequential: `expandGlob` returns the shell's sorted order, and an opener may be asynchronous,
  // so each file is finished before the next starts rather than racing them into the tab list.
  // Only awaited when the opener actually returns a promise — awaiting unconditionally would defer
  // every synchronous open by a microtask, so a whole glob would no longer land within `dispatch`.
  for (const file of files) {
    const pending = openOne(command, label, file, parsed.external, context);
    if (pending) await pending;
  }
}

type OpenOne = (
  command: string, label: string, file: string, external: boolean, context: OpenContext,
) => void | Promise<void>;

// The matched files to open, capped, with the reason reported when there are none or too many.
function globFiles(
  managers: Managers, command: string, label: string, target: string, matches: string[],
): string[] {
  if (matches.length === 0) {
    managers.tab.append(label, { input: command, output: `open: ${target}: no matching files` });
    return [];
  }
  const files = matches.slice(0, TabManager.OPEN_MAX_FILES);
  if (matches.length > files.length) {
    managers.tab.append(label, { input: command, output: `Opening the first ${files.length} of ${matches.length} matching files.` });
  }
  return files;
}
