import type { Tab } from '../tab/types.js';
import type { Managers } from '../managers.js';
import { tabRuntime } from '../tab/runtime.js';

// The one open tab as the `tabActivity` capability reports it and the `tabs` topic delivers it:
// everything a plugin needs to render a row about a tab and, when it also asks for the tail, to
// summarize what it is doing. It deliberately carries no transcript content beyond the capped `tail`,
// so a plugin that only lists tabs is never handed another tab's output unless it says it wants it.
//
// It lives beside the reader that builds it rather than in `api.ts`, which is the contract's surface
// and not a bag of payload types — a plugin reaches both from `api.js`, which re-exports this one.
export type TabActivityEntry = {
  label: string;
  // The tab's display name when it has an alias, absent otherwise.
  title?: string;
  // Which plugin owns this tab, when one does: its declaration id and the instance key it was opened
  // with. Absent for every other tab. It is the host's own record of ownership, and a plugin can
  // already speak it — a plugin knows the instance keys it opens with — so a reader can name its own
  // tabs without assuming anything about the label the host minted for them.
  plugin?: { id: string; instanceKey: string };
  // The tab's own dot colour — the one its strip entry is drawn in — so a rail row can match it rather
  // than rendering an application-wide default that says nothing about which tab it stands for.
  dotColor: string;
  // Body kind: undefined is a normal transcript tab, the rest are the named live views.
  view?: 'plugin' | 'harness' | 'editor' | 'monitor' | 'files' | 'notifications';
  dock?: 'left' | 'right';
  pane?: 'right';
  busy: boolean;
  hasUnread: boolean;
  // Whether this tab is the host's active one. The launcher is docked and can never be it, so the flag
  // is what lets a rail row be lifted into the active tier without the view deriving it for itself.
  active: boolean;
  // True when the tab is holding a prompt or question the user has to answer right now — a pending
  // agent question, or a harness blocked on a permission prompt. The one state worth interrupting
  // for, so it is reported separately from `busy` rather than inferred from it.
  needsInput: boolean;
  // When the tab last had any activity, in epoch milliseconds, rounded down to the minute. Minute
  // resolution is what makes the `tabs` topic cheap to deliver: two transcript appends inside one
  // minute report the same value, so a republish is not forced by every keystroke-driven append.
  // 0 means "no activity yet", which a freshly opened tab is.
  lastActivity: number;
  cwd: string;
  remote?: string;
  // The last command line the tab ran, when its transcript records one.
  lastCommand?: string;
  // How many entries the tab's transcript holds. A caller that keeps its own cursor through a tab's
  // transcript compares against this to learn whether anything is new, without re-reading the tail.
  logLength: number;
  // How many times the tab's transcript has been written. Not a substitute for `logLength` but a
  // companion to it: a cursor comparing only the length cannot see output rewritten into a running
  // entry, or an entry appended once the log is already at its cap, because neither of them moves it.
  // 0 for a tab nothing has been written to yet.
  revision: number;
  // The tab's most recent transcript entries as text, capped by the host. Present only when the
  // caller asked for it.
  tail?: string;
};

// How much of one entry survives the tail cap. A ceiling rather than a target: a tab whose last few
// entries are enormous contributes those entries clipped rather than the whole of them.
const ACTIVITY_TAIL_CHARS = 4000;

// One minute, in milliseconds. Last activity is reported at this resolution, which is what makes
// the `tabs` topic deliverable on the raw state broadcast without a republish per transcript
// append: two appends inside one minute report the same value, so the rows are unchanged and the
// launcher drops the second broadcast. The row still reads "4m ago", because a minute-resolution
// rendering cannot tell a rounded minute from an exact one.
const MINUTE_MS = 60_000;

// The last command line a tab ran, from its transcript. A tab whose last entries are output rather
// than commands has none, and neither does a tab with no transcript at all.
function lastCommandOf(entries: readonly Tab['log'][number][]): string | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const command = entries[index]?.input.trim();
    if (command) return command;
  }
  return undefined;
}

// The tab's most recent transcript entries as text: each command's line followed by what it
// produced, newest last, capped at both a whole-entry count and a character budget. The cap is
// applied by keeping the newest entries, so what survives is the most recent state.
function tailOf(entries: readonly Tab['log'][number][], lines: number): string {
  const kept = entries.slice(-lines).map((entry) => {
    const command = entry.input.trim();
    return command ? `${command}\n${entry.output}`.trim() : entry.output.trim();
  }).filter(Boolean);
  return kept.join('\n\n').slice(-ACTIVITY_TAIL_CHARS);
}

// One open tab as a `TabActivityEntry`. `tailLines` is the caller's ceiling, or undefined for no
// transcript content at all — a plugin that only lists tabs reads no other tab's output.
function entryFor(tab: Tab, managers: Managers, tailLines: number | undefined): TabActivityEntry {
  const busy = tab.runtime?.busy === true || tab.plugin?.busy === true;
  const pending = managers.questions.pendingFor(tab.label);
  return {
    label: tab.label,
    ...(tab.title !== undefined && { title: tab.title }),
    ...(tab.plugin && { plugin: { id: tab.plugin.id, instanceKey: tab.plugin.instanceKey } }),
    dotColor: tab.dotColor,
    ...(tab.view !== undefined && { view: tab.view }),
    ...(tab.dock !== undefined && { dock: tab.dock }),
    ...(tab.pane !== undefined && { pane: tab.pane }),
    busy,
    hasUnread: tab.hasUnread === true,
    // The host's own answer to which tab is active, read the same way `buildTabView` reads it, so a rail
    // row and the strip can never disagree about where the user is.
    active: managers.tab.activeTab >= 0 && managers.tab.tabs[managers.tab.activeTab]?.label === tab.label,
    // The two ways a tab can be waiting on the user rather than on work: a question it has asked,
    // or a harness blocked on a permission prompt the application is not answering for it. A gate is
    // a screen state, so it is durable only for a harness the app observes itself —
    // `src/harness/busy-status.ts` records it on the tab's runtime as each capture lands, after the
    // approver has already seen that capture, and leaves it false for a gate the approver is clearing
    // or a tab parked on a scheduled resume. A remote harness's transition arrives as a bare
    // busy/unread pair, so a remote gate reads as idle-unread there and not as needs-input.
    needsInput: pending !== undefined || tab.runtime?.gateNeedsUser === true,
    lastActivity: Math.floor((tab.runtime?.lastActivity ?? 0) / MINUTE_MS) * MINUTE_MS,
    cwd: tab.runtime?.cwd ?? managers.tab.launchDir,
    ...(tab.remote && { remote: tab.remote.host }),
    lastCommand: lastCommandOf(tab.log),
    logLength: tab.log.length,
    revision: tab.runtime?.transcriptRevision ?? 0,
    ...(tailLines !== undefined && { tail: tailOf(tab.log, tailLines) }),
  };
}

// Every tab the host has open, in strip order, as the `tabs` topic's rows and as the `tabActivity`
// capability's answer. One reader for both so the rows a view shows and the rows a summarizer
// summarizes can never disagree about what a tab is doing.
export function tabActivityRows(managers: Managers, tailLines?: number): TabActivityEntry[] {
  return managers.tab.tabs.map((tab) => entryFor(tab, managers, tailLines));
}

// Record whether a harness tab is currently held at a permission gate the user has to answer. A gate
// is a screen state the tab has to remember, because nothing downstream can re-read the capture it was
// seen in — the launcher's needs-input tier asks long after the frame is gone. Detection stays pure in
// auto-approve; this is the record of what the last capture meant, which is the raw detection anded
// with whether anything is answering the gate.
export function recordGateNeedsUser(managers: Managers, label: string, needsUser: boolean): void {
  const tab = managers.tab.byLabel(label);
  if (!tab) return;
  const runtime = tabRuntime(tab);
  if ((runtime.gateNeedsUser ?? false) === needsUser) return;
  runtime.gateNeedsUser = needsUser;
}
