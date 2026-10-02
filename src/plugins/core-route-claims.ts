import type { TabPluginDeclaration } from './api.js';
import { tabPluginCatalog } from './catalog.js';
import { rejectContribution } from './rejections.js';
import { RESERVED_NON_COMMAND_NAMES } from '../commands/reserved.js';
import { ROUTE_NAMES } from './command-adapter.js';

// The one ordered map of the command tokens a core command may route into a plugin's own inline
// opener, built from the catalog at module load for the same reason the opener and command maps are:
// a claim that conflicts has to be refused while the registries are being built, and recorded rather
// than thrown so one malformed manifest disables that one plugin instead of stopping the app.
//
// `harness` and `ssh` are reserved command names a plugin cannot claim, so `harness replay` resolves
// no plugin command at all; a route claim is how it reaches the plugin that owns the presentation.
// The claim names the token only — the plugin's existing opener is what runs, through `runOpener` —
// so first claim wins and a duplicate or reserved token is refused exactly as a command claim is.
const RESERVED = new Set([
  ...RESERVED_NON_COMMAND_NAMES.map((name) => name.toLowerCase()),
  ...ROUTE_NAMES,
]);

function refusalReason(route: string, owners: Map<string, string>): string | undefined {
  if (RESERVED.has(route)) return `reserved tab plugin core route claim "${route}"`;
  if (owners.has(route)) return `duplicate tab plugin core route claim "${route}"`;
  return undefined;
}

function buildOwners(declarations: readonly TabPluginDeclaration[]): Map<string, string> {
  const owners = new Map<string, string>();
  for (const declaration of declarations) {
    const claimed = declaration.coreRoutes ?? [];
    for (const token of claimed) {
      const route = token.toLowerCase();
      const refusal = refusalReason(route, owners);
      if (refusal) {
        rejectContribution(declaration.id, refusal);
        continue;
      }
      owners.set(route, declaration.id);
    }
  }
  return owners;
}

export const pluginCoreRoutes: ReadonlyMap<string, string> = buildOwners(tabPluginCatalog);

export function coreRouteOwner(route: string): string | undefined {
  return pluginCoreRoutes.get(route.toLowerCase());
}

// The same resolution over a caller-supplied set of declarations, for a host built on its own
// catalog. A refusal still goes through `rejectContribution`, so a host reading its own declarations
// next sees exactly what a host reading the production catalog would.
export function resolveCoreRoutes(
  declarations: readonly TabPluginDeclaration[],
): ReadonlyMap<string, string> {
  return buildOwners(declarations);
}
