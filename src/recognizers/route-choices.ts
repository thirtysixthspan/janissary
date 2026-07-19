import type { RouteChoice } from './types.js';

// Route-chooser presentation, split out of analyze.ts: a distinct concern from the
// recognizer-polling analysis that remains there.

// The routes a user may pick from in the chooser. Always offers shell and acp; offers a db
// choice per open connection (the query needs a concrete database to target).
export function routeChoices(openDbs: string[]): RouteChoice[] {
  const choices: RouteChoice[] = [{ label: 'shell', route: 'shell' }];
  for (const database of openDbs) choices.push({ label: `db query → ${database}`, route: 'db', dbName: database });
  choices.push({ label: 'acp (agent prompt)', route: 'acp' });
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
