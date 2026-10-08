import type { RouteChoice } from './types.js';

export const ACP_ROUTE_LABEL = 'acp (agent prompt)';

// Route-chooser presentation, split out of analyze.ts: a distinct concern from the
// recognizer-polling analysis that remains there.

// The routes a user may pick from in the chooser. Offers shell and optionally ACP; offers a db
// choice per open connection (the query needs a concrete database to target).
export function routeChoices(openDbs: string[], allowAcp = true): RouteChoice[] {
  const choices: RouteChoice[] = [{ label: 'shell', route: 'shell' }];
  for (const database of openDbs) choices.push({ label: `db query → ${database}`, route: 'db', dbName: database });
  if (allowAcp) choices.push({ label: ACP_ROUTE_LABEL, route: 'acp' });
  return choices;
}

// Rewrite a bare command into the explicit, prefixed form for `choice`'s route, so it can be
// dispatched through the normal command pipeline.
export function toPrefixedCommand(command: string, choice: RouteChoice): string {
  switch (choice.route) {
    case 'shell': {
      return `shell ${command}`;
    }
    case 'acp': {
      return `acp ${command}`;
    }
    case 'db': {
      return `db sqlite query ${choice.dbName} ${command}`;
    }
  }
}
