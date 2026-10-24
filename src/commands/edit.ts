import type { Command } from './types.js';
import { appendCommandOutput } from '../command/append.js';
import { existsSync } from 'node:fs';
import { resolveTabPath } from '../tab/resolve-path.js';
import { isRunscriptName } from '../schedule/system/runscript.js';
import { readRunscript } from '../schedule/system/runscript-files.js';

// `edit <file>` — open the in-app plain-text editor on any file, regardless of which opener owns
// its extension (`open readme.md` keeps the rendered view; `edit readme.md` opens the editor).
export const command: Command = {
  name: 'edit',
  match: (command_) => /^edit\b/i.test(command_),
  samples: ['edit', 'edit notes.txt'],
  run: (command, tab, managers, invocation) => {
    const target = command.replace(/^edit\b\s*/i, '').trim();
    if (!target) { appendCommandOutput(managers, tab.label, { input: command, output: 'Usage: edit <file>' }, invocation); return; }
    const lineMatch = /^(.+):(\d+)$/.exec(target);
    let fileTarget = lineMatch ? lineMatch[1] : target;
    const line = lineMatch ? Number(lineMatch[2]) : undefined;
    if (line === undefined && isRunscriptName(fileTarget)) {
      const exactFile = resolveTabPath(managers, tab.label, fileTarget);
      if (!existsSync(exactFile)) {
        try {
          const runscript = readRunscript(managers.tab.launchDir, fileTarget);
          if (!runscript.exists) {
            appendCommandOutput(managers, tab.label, {
              input: command, output: `No runscript named "${fileTarget}".`,
            }, invocation);
            return;
          }
          fileTarget = runscript.file;
        } catch {
          appendCommandOutput(managers, tab.label, {
            input: command, output: `Could not read runscript "${fileTarget}".`,
          }, invocation);
          return;
        }
      }
    }
    appendCommandOutput(managers, tab.label, { input: command, output: '' }, invocation);
    return managers.openFile.editForCommand(command, fileTarget, tab.label, line, invocation?.runId);
  },
};
