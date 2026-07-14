import type { Tab } from '../types.js';
import type { ConnectionView, ScheduleView, TabView } from '../protocol.js';
import { flattenBuffer } from './index.js';

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
): TabView {
  return {
    label: tab.label,
    number: tab.number,
    dotColor: tab.dotColor,
    group: tab.group,
    groupColor: tab.groupColor,
    busy,
    hasUnread: !!tab.hasUnread,
    cwd,
    acp,
    connections,
    schedule,
    bufferLines: flattenBuffer(tab.log, !tab.toolStepsExpanded)
      .map((l) => (l.cwd ? { ...l, cwd: shorten(l.cwd) } : l)),
    cmdHistory: tab.cmdHistory,
    commandQueue,
    toolStepsExpanded: !!tab.toolStepsExpanded,
    view: tab.view,
    title: tab.title,
    image: tab.image,
    page: tab.page,
    harness: tab.harness,
    markdown: tab.markdown,
    editor: tab.editor,
    // Deliberately NOT spreading `tab.editorDraft` here: the transient unsaved buffer is
    // server-only and must never be broadcast back to clients (see editor-live-buffer-sync plan).
    // Same for `tab.pageSnapshot`: the visible-text cache is server-only, read by monitor page
    // feeds, and must never be broadcast back to clients (see monitor-page-tab-content-feed plan).

    monitor: tab.monitor,
    files: tab.files ? { ...tab.files, root: shorten(tab.files.root) } : undefined,
    activePty: tab.activePty,
    dock: tab.dock,
  };
}
