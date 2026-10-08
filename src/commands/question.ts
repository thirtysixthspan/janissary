import type { Command, CommandManagers } from './types.js';
import { runQuestionCommand } from '../question-command.js';

// Posts the question and keeps its entry running until the human answers.
function ask(command_: string, label: string, managers: CommandManagers): void {
  const result = runQuestionCommand(command_, label, managers.questions);
  if (typeof result === 'string') {
    managers.tab.append(label, { input: command_, output: result });
    return;
  }
  managers.tab.startRunning(label, command_);
  void result.then((answer) => {
    managers.tab.finishRunning(label, answer, { command: command_ });
  });
}

export const command: Command = {
  name: 'question',
  match: (command_) => /^question\s+(ask|approve)\b/i.test(command_),
  samples: ['question ask hello', 'question approve 1'],
  run: (command_, tab, managers) => { ask(command_, tab.label, managers); },
};
