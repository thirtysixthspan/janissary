import type { Command, CommandInvocationContext, CommandManagers } from './types.js';
import { runQuestionCommand } from '../question-command.js';
import { appendCommandOutput } from '../command/append.js';

// Posts the question and keeps its entry running until the human answers.
function ask(command_: string, label: string, managers: CommandManagers, invocation?: CommandInvocationContext): string | void | Promise<string> {
  const result = runQuestionCommand(command_, label, managers.questions, invocation?.signal);
  if (typeof result === 'string') {
    appendCommandOutput(managers, label, { input: command_, output: result }, invocation);
    return;
  }
  managers.tab.startRunning(label, command_);
  if (!invocation?.awaitResult) {
    void finishQuestion(result, command_, label, managers);
    return;
  }
  return finishQuestion(result, command_, label, managers);
}

async function finishQuestion(result: Promise<string>, command_: string, label: string, managers: CommandManagers): Promise<string> {
  const answer = await result;
  managers.tab.finishRunning(label, answer, { command: command_ });
  return answer;
}

export const command: Command = {
  name: 'question',
  match: (command_) => /^question\s+(ask|approve)\b/i.test(command_),
  samples: ['question ask hello', 'question approve 1'],
  run: (command_, tab, managers, invocation) => ask(command_, tab.label, managers, invocation),
};
