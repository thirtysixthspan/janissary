import type { Command } from './types.js';
import { runQuestionCommand } from '../question-command.js';

export const command: Command = {
  name: 'question',
  match: (command_) => /^question\s+(ask|approve)\b/i.test(command_),
  run: (command_, tab, managers) => {
    const result = runQuestionCommand(command_, tab.label, managers.questions);
    if (typeof result === 'string') {
      managers.tab.append(tab.label, { input: command_, output: result });
      return;
    }
    managers.tab.startRunning(tab.label, command_);
    void result.then((answer) => managers.tab.finishRunning(tab.label, answer));
  },
};
