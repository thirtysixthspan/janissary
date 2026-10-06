import { getOutput, unknownCommandMessage } from '../commands.js';
import { recognizeRoute } from '../route-choice.js';
import type { Managers } from '../managers.js';

export function routeUnknownCommand(
  text: string,
  trimmed: string,
  label: string,
  managers: Managers,
  run: (label: string, text: string, callback: (out: string) => void) => void,
  callback: (out: string) => void,
): void {
  const result = getOutput(trimmed);
  // Only `help`, bare or with a section, answers with output, and its text is always markdown.
  if (result.kind === 'output') {
    managers.tab.append(label, { input: text, output: result.text, markdown: true });
    callback(result.text);
    return;
  }

  // `silent` and `unknown` are both answered the same way: try to recognize a route for the text,
  // and report it unrecognized when none fits. The message comes from the one place that builds it.
  const route = recognizeRoute(trimmed, label, managers);
  if (route.kind === 'routed') {
    run(label, route.command, callback);
    return;
  }
  callback(unknownCommandMessage(trimmed));
}
