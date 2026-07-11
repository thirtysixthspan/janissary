import { messageBus } from './bus.js';
import { toPrefixedCommand, routeChoices } from './recognizers/index.js';
import type { RouteChoice } from './recognizers/types.js';
import { resolveRouteChoice } from './route-choice.js';
import type { Managers } from './managers.js';

export function resolveUnknownCommand(
  cmd: string,
  label: string,
  managers: Managers,
  run: (input: string, label: string, index: number) => void,
  setPending: (pending: { label: string; cmd: string; choices: RouteChoice[] } | null) => void,
): void {
  const openDbs = managers.database.openDbs(label);
  const choice = resolveRouteChoice(cmd, openDbs);
  if (choice) {
    run(toPrefixedCommand(cmd, choice), label, managers.tab.findIndex(label));
  } else {
    setPending({ label, cmd, choices: routeChoices(openDbs) });
    messageBus.emit('state', { type: 'dirty' });
  }
}
