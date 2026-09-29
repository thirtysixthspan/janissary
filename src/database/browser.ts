import type { DatabaseRefView, DatabaseResultView } from '../protocol.js';
import { databaseFileExists, listDatabaseFiles, listOpenConnections } from '../connections.js';

// The stateful half of the browser: the capped, most-recent-first answer list a plugin folds into
// its tab payload, and the database list beside it.
//
// `topicAction` is fire-and-forget, so an answer can only arrive on the next topic delivery. The
// request id a plugin minted rides out with the action and comes back on the result, which is the
// whole addressing scheme. The cap is what bounds this on the state-broadcast path: a browsing
// session that has issued a thousand queries publishes thirty-two answers, not a thousand.

// How many answers stay published. A request whose answer was evicted before the plugin folded it
// in is a lost answer, and the plugin recovers by re-issuing — the control it already has.
export const RESULT_LIMIT = 32;

export class DatabaseBrowserState {
  private next = 0;
  private answers: DatabaseResultView[] = [];

  /** A request id no answer can already carry. */
  requestId(): string {
    this.next += 1;
    return `q${this.next}`;
  }

  record(result: DatabaseResultView): void {
    this.answers = [result, ...this.answers].slice(0, RESULT_LIMIT);
  }

  results(): DatabaseResultView[] {
    return this.answers;
  }

  clear(): void {
    this.answers = [];
  }
}

// Every database the registry knows: the files on disk, plus any connection open under a name no
// file carries. Sorted, and a name appears once.
export function databaseRefs(): DatabaseRefView[] {
  const open = listOpenConnections();
  const names = [...new Set([...listDatabaseFiles(), ...open])]
    .toSorted((a, b) => a.localeCompare(b));
  return names.map((name) => ({ name, exists: databaseFileExists(name), open: open.includes(name) }));
}
