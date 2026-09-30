import {
  noFileOpener,
  type DatabaseResultView,
  type TabPluginActivation,
  type TabPluginServerCapabilities,
} from '../api.js';
import { isSqlPayload, type SqlPayload, type SqlPending } from './shared.js';
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
  report(key, refreshed.error, folded.payload.error, capabilities);
  say(key, pending.followUp, answer, capabilities);
  if (folded.followUp) {
    dispatch(key, folded.payload, folded.followUp, capabilities, tabs, publish);
    return;
  }
  publish(folded.payload);
}

/**
 * Say a failure once, to the notifications feed, when it is a new one.
 *
 * A failure is the one result a user did not ask for and cannot predict, so it is the one that wants
 * to be said whether or not this tab is on screen. Comparing against the error the tab last recorded
 * is what keeps a refresh that fails the same way twice from saying it twice.
 *
 * Every line names the tab it is about. It is said from a topic notification, which has no invoking
 * tab, so without the key the feed would attribute it to nothing.
 */
function report(
  key: string,
  before: string | null,
  after: string | null,
  capabilities: TabPluginServerCapabilities,
): void {
  if (after === null || after === before) return;
  capabilities.notifyUser(after, { tab: key });
}

/** What a statement that changed rows reports once it has run. */
function changedOutcome(changed: number): string {
  if (changed === 0) return 'OK.';
  return `${changed} row${changed === 1 ? '' : 's'} changed.`;
}

/**
 * Say what a statement the user typed produced.
 *
 * A statement that returned rows carries its result on the answer, shortened and with a file beside
 * it when the whole of it is too long for one line — the same arrangement an auto-approved permission
 * prompt's screen capture uses. A statement that changed rows reports the count, which is always
 * short enough to say outright. Anything else was not a statement the user typed: a write the grid
 * made itself, or a page it asked for, and neither is a report.
 *
 * A statement that failed is not reported here — `report` has already said so, and saying it twice
 * would put the same failure in the feed twice.
 */
function say(
  key: string,
  followUp: SqlPending['followUp'],
  answer: DatabaseResultView,
  capabilities: TabPluginServerCapabilities,
): void {
  if (answer.kind === 'query' && answer.report) {
    // The file is carried only when there is one: a line that has nothing to open says so by having
    // no link on it, which is what a line without one already does.
    const { file } = answer.report;
    capabilities.notifyUser(answer.report.text, { tab: key, ...(file && { openFile: file }) });
    return;
  }
  if (followUp !== 'console' || answer.kind !== 'write' || answer.error) return;
  capabilities.notifyUser(changedOutcome(answer.changed), { tab: key });
}
