import { getOutput } from './commands.js';
import { toPrefixedCommand } from './recognizers/index.js';
import { resolveRouteChoice } from './route-choice.js';
import type { Managers } from './managers.js';

export function routeUnknownCommand(
  text: string,
  trimmed: string,
  label: string,
  managers: Managers,
  run: (label: string, text: string, callback: (out: string) => void) => void,
  callback: (out: string) => void,
): void {
  const output = getOutput(trimmed);
  if (output !== null && !output.startsWith('Unknown command:')) {
    managers.tab.append(label, { input: text, output, markdown: trimmed === 'help' });
    callback(output);
    return;
  }

  const openDbs = managers.database.openDbs(label);
  const choice = resolveRouteChoice(trimmed, openDbs);
  if (choice) {
    run(label, toPrefixedCommand(trimmed, choice), callback);
    return;
  }
  callback(output ?? `Unknown command: "${trimmed}".`);
}
