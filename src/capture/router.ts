import { getOutput, unknownCommandMessage } from '../commands.js';
import type { Managers } from '../managers.js';

export function routeUnknownCommand(
  text: string,
  trimmed: string,
  label: string,
  managers: Managers,
  callback: (out: string) => void,
): void {
  const result = getOutput(trimmed);
  // Only `help`, bare or with a section, answers with output, and its text is always markdown.
  if (result.kind === 'output') {
    managers.tab.append(label, { input: text, output: result.text, markdown: true });
    callback(result.text);
    return;
  }

  callback(unknownCommandMessage(trimmed));
}
