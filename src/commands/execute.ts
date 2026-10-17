import type { Command } from './types.js';
import { appendCommandOutput } from '../command/append.js';
import { isRunscriptName } from '../schedule/system/runscript.js';
import { readRunscript } from '../schedule/system/runscript-files.js';

export const command: Command = {
  name: 'execute',
  match: (command_) => /^execute\b/i.test(command_),
  samples: ['execute deploy'],
  run: async (command_, tab, managers, invocation) => {
    const name = command_.replace(/^execute\b\s*/i, '').trim();
    if (!isRunscriptName(name)) {
      appendCommandOutput(managers, tab.label, {
        input: command_, output: 'Usage: execute <name>',
      }, invocation);
      return;
    }

    let runscript;
    try {
      runscript = readRunscript(managers.tab.launchDir, name);
    } catch {
      appendCommandOutput(managers, tab.label, {
        input: command_, output: `Could not read runscript "${name}".`,
      }, invocation);
      return;
    }
    if (!runscript.exists) {
      appendCommandOutput(managers, tab.label, {
        input: command_, output: `No runscript named "${name}".`,
      }, invocation);
      return;
    }

    const shell = await managers.systemShell.ensure();
    if (shell.status !== 'ok') return;
    managers.tab.enqueueSystemBatch('system', runscript.lines);
  },
};
