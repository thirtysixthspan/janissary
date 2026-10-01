import type { Command, CommandManagers } from './types.js';
import { runQuestionCommand } from '../question-command.js';

// Posts the question and keeps the tab's transcript entry running until the human answers. `reply`
// hears the same text the entry ends with, which is what lets a messaged question answer its sender
// with the human's answer rather than with the empty entry that stands in while the question waits.
function ask(command_: string, label: string, managers: CommandManagers, reply?: (output: string) => void): void {
  const result = runQuestionCommand(command_, label, managers.questions);
  if (typeof result === 'string') {
    managers.tab.append(label, { input: command_, output: result });
    reply?.(result);
    return;
  }
  managers.tab.startRunning(label, command_);
  void result.then((answer) => {
    managers.tab.finishRunning(label, answer, { command: command_ });
    reply?.(answer);
  });
}

export const command: Command = {
  name: 'question',
  match: (command_) => /^question\s+(ask|approve)\b/i.test(command_),
  samples: ['question ask hello', 'question approve 1'],
  run: (command_, tab, managers) => { ask(command_, tab.label, managers); },
  capture: (command_, label, managers, reply) => { ask(command_, label, managers, reply); },
};
