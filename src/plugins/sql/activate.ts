import {
  noFileOpener,
  type TabPluginActivation,
  type TabPluginServerCapabilities,
} from '../api.js';
import { isSqlPayload, type SqlPayload } from './shared.js';
import { databasesFrom, NO_DATABASES, resultFor, SqlTabs, USAGE } from './tabs.js';
import { dispatch, planRequest } from './request.js';
import { openDatabase } from './open-tab.js';
import { isValidDatabaseName, parseOpenCommand } from './shared-intents.js';
import { fold, registerExports } from './fold.js';
import { intentsFor } from './intents.js';

// `sql` opens or focuses a database's tab; `sql <name>` names which; `sql left`/`sql right` dock it,
// and bare `sql` on a docked tab undocks it — the `schedules [left|right]` grammar, read through the
// one published parser so the two cannot drift.
//
// The tab's state is its payload and nothing else. Answers arrive on the `databases` topic, so this
// module only has to match one against the request id a tab is waiting for and fold it in — and the
// `SqlTabs` mirror exists solely because a notification carries no payloads to fold into.
export function activate(): TabPluginActivation {
  const tabs = new SqlTabs();
  return {
    isPayload: isSqlPayload,
    command: (argument, capabilities) => {
      runCommand(argument, capabilities, tabs);
    },
    notify: (event, capabilities) => {
      if (event.topic !== 'databases') return;
      tabs.prune(event.tabs);
      const data = databasesFrom(capabilities);
      for (const key of event.tabs) {
        const payload = tabs.read(key);
        if (payload) deliver(key, payload, data, capabilities, tabs);
      }
    },
    intent: intentsFor(tabs),
    dispose: () => { tabs.dispose(); },
    opener: noFileOpener('sql'),
  };
}

// `sql [name] [left|right]`. The dock side is the last token when it is one, and the name is what is
// left — so `sql shop left` docks the `shop` tab and `sql left` docks whichever database is current.
// A database actually named `left` or `right` is therefore unreachable by name, which is the same
// trade the conversations plugin makes for a conversation titled `left`.
function runCommand(argument: string, capabilities: TabPluginServerCapabilities, tabs: SqlTabs): void {
  const data = databasesFrom(capabilities);
  const parsed = parseOpenCommand(argument);
  if (parsed === 'usage') return capabilities.rejectRequest(USAGE);
  const { name, dock } = parsed;
  if (name) {
    if (!isValidDatabaseName(name)) return capabilities.rejectRequest(`Invalid database name "${name}".`);
    // A command is typed, and a typo in a typed command is the ordinary case — so a name the
    // registry has never heard of is refused rather than created. `db sqlite create` is how a
    // database gets made, and the tab's own switcher refuses one for the same reason.
    openDatabase(name, dock, capabilities, tabs);
    return;
  }
  // The most recently reached open database, which is what a bare `sql` means by "the one I was in".
  // With none open the first by name is the only answer there is.
  const current = data.lastOpened ?? data.databases[0]?.name;
  if (!current) return capabilities.rejectRequest(NO_DATABASES);
  openDatabase(current, dock, capabilities, tabs);
}

/**
 * Fold the answer a tab was waiting for, then send whatever that answer implies.
 *
 * The two are separate steps and the order is fixed: the payload is published and recorded in the
 * mirror before the follow-up leaves for the host, because the host answers `topicAction`
 * synchronously and the answer is delivered back into this plugin before the call returns. Sending
 * first is what made the tab wait forever on a request nobody would answer, and what made folding a
 * schema answer recurse into itself.
 */
function deliver(
  key: string,
  payload: SqlPayload,
  data: ReturnType<typeof databasesFrom>,
  capabilities: TabPluginServerCapabilities,
  tabs: SqlTabs,
): void {
  const refreshed = { ...payload, databases: data.databases.map((entry) => ({ ...entry })) };
  const publish = (next: SqlPayload): void => {
    // The export references are minted inside the update factory, because that is the only place a
    // payload factory may register a file. `updateTab` runs that factory synchronously, so what it
    // produced is captured and written back to the mirror — otherwise the plugin's own copy of this
    // tab would keep the pre-registration payload and a later update would send a download link with
    // no reference in it.
    let sent: SqlPayload | undefined;
    capabilities.updateTab(key, (resources) => {
      sent = { ...next, exports: registerExports(key, next, resources, tabs) };
      return { payload: sent };
    });
    tabs.write(key, sent ?? next);
  };
  const pending = refreshed.pending;
  if (!pending) {
    publish(refreshed);
    return;
  }
  const answer = resultFor(data, pending.id, refreshed.database);
  if (!answer) {
    // The answer was evicted before it arrived, or the delivery predates the request. Either way it
    // is not coming, and a tab waiting forever on a request nobody will answer is the one failure
    // mode a fire-and-forget topic has — so re-issue rather than wait.
    const action = pending.followUp === 'query' ? 'query' : 'schema';
    dispatch(key, refreshed, planRequest(action, refreshed), capabilities, tabs, publish);
    return;
  }
  const folded = fold(key, refreshed, answer, tabs, pending.followUp);
  report(refreshed.error, folded.payload.error, capabilities);
  if (folded.followUp) {
    dispatch(key, folded.payload, folded.followUp, capabilities, tabs, publish);
    return;
  }
  publish(folded.payload);
}

/**
 * Say a failure once, to the notifications feed, when it is a new one.
 *
 * The line under the prompt is not where a failure belongs: it is the outcome of the last statement,
 * it is overwritten by the next thing typed, and it is gone the moment the user looks at another tab.
 * A failure is the one result a user did not ask for and cannot predict, so it is the one that wants
 * to be said whether or not this tab is on screen. Comparing against the error already on screen is
 * what keeps a refresh that fails the same way twice from saying it twice.
 */
function report(before: string | null, after: string | null, capabilities: TabPluginServerCapabilities): void {
  if (after === null || after === before) return;
  capabilities.notifyUser(after);
}
