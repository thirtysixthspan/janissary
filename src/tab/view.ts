import type { Tab } from './types.js';
import type { ConnectionView, PendingQuestionView, ScheduleView, TabView } from '../protocol.js';
import type { Managers } from '../managers.js';
import path from 'node:path';
import { flattenBuffer } from './index.js';

export function buildTabViews(
  tabs: Tab[],
  managers: Managers,
  connectionsFor: (label: string) => ConnectionView[],
  acpLabel: (label: string) => string | undefined,
  scheduleView: (label: string) => ScheduleView[],
  shorten: (path: string) => string,
): TabView[] {
  return tabs.map((tab) => buildTabView(
    tab,
    tab.runtime?.busy ?? false,
    tab.runtime?.cwd ?? process.cwd(),
    acpLabel(tab.label),
    connectionsFor(tab.label),
    scheduleView(tab.label),
    tab.runtime?.queue ?? [],
    shorten,
    managers.questions.pendingFor(tab.label),
    (label) => managers.remote.workspaceOf(label),
  ));
}

// Converts one internal Tab into the wire-format TabView sent to the client — the shape the
// client actually renders, as opposed to Tab's server-side bookkeeping fields.
export function buildTabView(
  tab: Tab,
  busy: boolean,
  cwd: string,
  acp: string | undefined,
  connections: ConnectionView[],
  schedule: ScheduleView[],
  commandQueue: string[],
  shorten: (path: string) => string,
  pendingQuestion?: PendingQuestionView,
  workspaceOf?: (label: string) => string | undefined,
): TabView {
  const workspacePrefix = tab.workspaceDir ?? (tab.remote ? workspaceOf?.(tab.label) : undefined);
  return {
    label: tab.label,
    number: tab.number,
    dotColor: tab.dotColor,
    group: tab.group,
    groupColor: tab.groupColor,
    busy,
    hasUnread: !!tab.hasUnread,
    cwd: shorten(cwd),
    cwdDisplay: workspaceCwdDisplay(cwd, workspacePrefix),
    // A remote tab is workspaced too — its clone just lives on the other host, so the flag is
    // derived from either field rather than from `workspaceDir` alone.
    // The browser flag means the tab *has* a browser, not that it was launched with `-b`: a browser
    // that is gone leaves `tab.browser` set (`profile save` reads it) while `browserError` records
    // that nothing is there to connect to any more, so the flag drops with the same broadcast that
    // raises the tab's gone-browser band.
    flags: [
      ...(tab.workspaceDir || tab.remote ? ['workspaced'] : []),
      ...(tab.autoApprove ? ['autoApprove'] : []),
      ...(tab.browser && !tab.harness?.browserError ? ['browser'] : []),
    ],
    remote: tab.remote,
    acp,
    connections,
    schedule,
    bufferLines: flattenBuffer(tab.log, !tab.toolStepsExpanded)
      .map((l) => (l.cwd ? { ...l, cwd: shorten(l.cwd) } : l)),
    cmdHistory: tab.cmdHistory,
    commandQueue,
    toolStepsExpanded: !!tab.toolStepsExpanded,
    pendingQuestion,
    view: tab.view,
    title: tab.title,
    plugin: tab.plugin ? {
      id: tab.plugin.id,
      schemaVersion: tab.plugin.schemaVersion,
      payload: tab.plugin.payload,
    } : undefined,
    harness: tab.harness,
    editor: tab.editor ? { ...tab.editor, path: shorten(tab.editor.path) } : undefined,
    // Deliberately NOT spreading `tab.editorDraft` here: the transient unsaved buffer is
    // server-only and must never be broadcast back to clients (see editor-live-buffer-sync plan).
    // Same for `tab.pageSnapshot`: the visible-text cache a plugin writes through `snapshotTab` is
    // server-only, read by monitor page feeds, and must never be broadcast back to clients.

    monitor: tab.monitor,
    files: tab.files ? { ...tab.files, root: shorten(tab.files.root), absoluteRoot: tab.files.root } : undefined,
    activePty: tab.activePty,
    dock: tab.dock,
    pane: tab.pane,
  };
}

// The metadata row's display symbol for a workspaced tab's working directory: `$workspace` at the
// clone root, `$workspace/<rest>` inside it — local and remote clones alike, since a remote clone
// is a path the local `$root` abbreviation could never shorten. Undefined when no workspace prefix
// applies; display-only, so `cwd` keeps the value every other consumer reads.
function workspaceCwdDisplay(cwd: string, workspace?: string): string | undefined {
  if (!workspace) return undefined;
  if (cwd === workspace) return '$workspace';
  if (cwd.startsWith(workspace + path.sep)) return `$workspace${cwd.slice(workspace.length)}`;
  return undefined;
}
