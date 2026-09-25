import { messageBus } from '../bus.js';
import { routeChoices } from '../recognizers/index.js';
import type { RouteChoice } from '../recognizers/types.js';
import { recognizeRoute } from '../route-choice.js';
import type { Managers } from '../managers.js';

export function resolveUnknownCommand(
  cmd: string,
  label: string,
  managers: Managers,
  run: (input: string, label: string, index: number) => void,
  setPending: (pending: { label: string; cmd: string; choices: RouteChoice[] } | null) => void,
): void {
  const route = recognizeRoute(cmd, label, managers);
  if (route.kind === 'routed') {
    run(route.command, label, managers.tab.findIndex(label));
  } else {
    setPending({ label, cmd, choices: routeChoices(route.openDbs) });
    messageBus.emit('state', { type: 'dirty' });
  }
}
