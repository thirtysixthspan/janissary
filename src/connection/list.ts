import { connectionCatalog } from './catalog.js';
import type { Managers } from '../managers.js';

// The `connection list` lines and the `connection close` completion candidates, both read off the
// one catalog the connections panel is also built from, so every name either surface offers is one
// `connection close` accepts.

// One `<kind>:<id>` line per catalog entry — the issuing tab's own connections, then every other
// tab's ssh connection and every other open SQLite database — with any detail (an ssh destination)
// in parentheses after it.
export function listLines(managers: Managers, label: string): string[] {
  return connectionCatalog(managers, label).map((e) => (e.detail ? `${e.kind}:${e.id} (${e.detail})` : `${e.kind}:${e.id}`));
}

export function listCompletionConnections(managers: Managers, label: string): string[] {
  return connectionCatalog(managers, label).map((e) => `${e.kind}:${e.id}`);
}
