import { analyzeCommand } from './recognizers/index.js';
import type { RouteChoice } from './recognizers/types.js';

// Whether `input` resolves to a route (and if so, which one). A bare 'db' target auto-resolves
// when exactly one db is open — the caller only needs to prompt when there's a real ambiguity.
export function resolveRouteChoice(input: string, openDbs: string[]): RouteChoice | undefined {
  const decision = analyzeCommand(input, { openDbs });
  if (decision.kind !== 'route' || (decision.route === 'db' && openDbs.length !== 1)) return undefined;
  return decision.route === 'db'
    ? { label: '', route: 'db', dbName: openDbs[0] }
    : { label: '', route: decision.route };
}
