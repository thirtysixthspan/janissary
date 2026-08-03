import path from 'node:path';
import { isGlobPattern, parseOpen } from './commands/open.js';
import { expandUserPath } from './paths.js';
import { webClaimPluginId } from './openers/index.js';
import type { OpenContext } from './openers/index.js';
import type { Managers } from './managers.js';
import { TabManager } from './tab/manager.js';

// OpenFileManager.run, extracted whole: resolves an `open <target>` command to a web URL, an
// expanded glob, or a single path, and dispatches each to its opener. `expandGlob` — the one
// piece of this flow that shells out — stays the caller's, passed through as an opaque callback
// so this module never itself touches shell execution.
async function runAfter(pending: Promise<void>, action: () => void | Promise<void>): Promise<void> {
  await pending;
  await action();
}

// How a pinned command refuses a target that is not its own. Shared with `OpenFileManager.openOne`
// so `video notes.txt` and `video https://example.com` report the same thing.
export function pinnedOpenerRefusal(requireOpener: string, target: string): string {
  return `${requireOpener}: ${target}: not a ${requireOpener} file`;
}

function runSequential(
  files: string[],
  action: (file: string) => void | Promise<void>,
): void | Promise<void> {
  let pending: Promise<void> | undefined;
  for (const file of files) {
    if (pending) {
      pending = runAfter(pending, () => action(file));
      continue;
    }
    const result = action(file);
    if (result) pending = Promise.resolve(result);
  }
  return pending;
}

export function runOpenCommand(
  managers: Managers, parsedCommand: string, displayCommand: string, label: string,
  buildContext: (command: string, label: string) => OpenContext,
  expandGlob: (pattern: string, cwd: string) => string[],
  openOne: (
    command: string, label: string, file: string, external: boolean, context: OpenContext,
  ) => void | Promise<void>,
  requireOpener?: string,
): void | Promise<void> {
  const parsed = parseOpen(parsedCommand);
  if ('error' in parsed) { managers.tab.append(label, { input: displayCommand, output: parsed.error }); return; }
  const cwd = managers.tab.cwdOf(label) ?? process.cwd();
  const context = buildContext(displayCommand, label);
  const target = expandUserPath(parsed.target, { root: managers.tab.launchDir });

  // The web branch resolves ahead of the opener registry, so a pinned command has to be refused here
  // rather than in `openOne` — which a web target never reaches. Both the `https://` scheme and a
  // bare `page` keyword land here, so without this `video page notes.txt` would open a browser tab.
  // The target is handed to the claiming plugin verbatim: recognizing a web address is the host's
  // job, deciding what one means is the plugin's.
  if (parsed.web) {
    if (requireOpener !== undefined) {
      managers.tab.append(label, { input: displayCommand, output: pinnedOpenerRefusal(requireOpener, target) });
      return;
    }
    if (!webClaimPluginId) {
      managers.tab.append(label, { input: displayCommand, output: 'open: no viewer for web addresses' });
      return;
    }
    return context.runPluginOpener(webClaimPluginId, parsed.external ? 'external' : 'inline', target);
  }

  if (isGlobPattern(target)) {
    const matches = expandGlob(target, cwd);
    if (matches.length === 0) { managers.tab.append(label, { input: displayCommand, output: `open: ${target}: no matching files` }); return; }
    const files = matches.slice(0, TabManager.OPEN_MAX_FILES);
    if (matches.length > files.length) {
      managers.tab.append(label, { input: displayCommand, output: `Opening the first ${files.length} of ${matches.length} matching files.` });
    }
    return runSequential(
      files,
      (file) => openOne(displayCommand, label, file, parsed.external, context),
    );
  }

  const file = path.isAbsolute(target) ? target : path.resolve(cwd, target);
  return openOne(displayCommand, label, file, parsed.external, context);
}
