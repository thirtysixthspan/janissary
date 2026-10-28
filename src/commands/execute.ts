import type { Command } from './types.js';
import type { Managers } from '../managers.js';
import { appendCommandOutput } from '../command/append.js';
import { isRunscriptName } from '../schedule/system/runscript.js';
import { readRunscript } from '../schedule/system/runscript-files.js';

export async function runRunscriptNow(managers: Managers, name: string): Promise<string | undefined> {
  let runscript;
  try {
    runscript = readRunscript(managers.tab.launchDir, name);
  } catch {
    return `Could not read runscript "${name}".`;
  }
  if (!runscript.exists) return `No runscript named "${name}".`;

  await queueRunscriptLines(managers, runscript.lines);
}

export async function queueRunscriptLines(managers: Managers, lines: string[]): Promise<void> {
  const shell = await managers.systemShell.ensure();
  if (shell.status !== 'ok') return;
  managers.tab.enqueueSystemBatch('system', lines);
}

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

    const failure = await runRunscriptNow(managers, name);
    if (failure !== undefined) {
      appendCommandOutput(managers, tab.label, { input: command_, output: failure }, invocation);
    }
  },
};
