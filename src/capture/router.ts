import { getOutput, unknownCommandMessage } from '../commands.js';
import { toPrefixedCommand } from '../recognizers/index.js';
import { resolveRouteChoice } from '../route-choice.js';
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
  if (result.kind === 'output') {
    managers.tab.append(label, { input: text, output: result.text, markdown: trimmed === 'help' });
    callback(result.text);
    return;
  }

  // `silent` and `unknown` are both answered the same way: try to recognize a route for the text,
  // and report it unrecognized when none fits. The message comes from the one place that builds it.
  const openDbs = managers.database.openDbs(label);
  const choice = resolveRouteChoice(trimmed, openDbs);
  if (choice) {
    run(label, toPrefixedCommand(trimmed, choice), callback);
    return;
  }
  callback(unknownCommandMessage(trimmed));
}
