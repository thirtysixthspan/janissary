import type { Command } from './types.js';
import { appendCommandOutput } from '../command/append.js';
import { isRunscriptName } from '../schedule/system/runscript.js';
import { createRunscript } from '../schedule/system/runscript-files.js';

const USAGE = 'Usage: create script <name>';

// `create script <name>` — make an empty project runscript at `.janissary/scripts/<name>.rs`, creating
// that directory when it is missing, and open it in the editor. An existing runscript is opened as it
// is, never overwritten.
export const command: Command = {
  name: 'create',
  match: (command_) => /^create\b/i.test(command_),
  samples: ['create script deploy'],
  run: (command_, tab, managers, invocation) => {
    const argument = /^create\s+script\s+(\S+)$/i.exec(command_.trim());
    if (!argument) { appendCommandOutput(managers, tab.label, { input: command_, output: USAGE }, invocation); return; }
    const name = argument[1];
    if (!isRunscriptName(name)) {
      appendCommandOutput(managers, tab.label, {
        input: command_, output: `Invalid runscript name "${name}". Use lowercase words separated by single hyphens.`,
      }, invocation);
      return;
    }

    let runscript;
    try {
      runscript = createRunscript(managers.tab.launchDir, name);
    } catch {
      appendCommandOutput(managers, tab.label, {
        input: command_, output: `Could not create runscript "${name}".`,
      }, invocation);
      return;
    }
    appendCommandOutput(managers, tab.label, {
      input: command_, output: runscript.created ? '' : `Runscript "${name}" already exists.`,
    }, invocation);
    return managers.openFile.editForCommand(command_, runscript.file, tab.label, undefined, invocation?.runId);
  },
};
