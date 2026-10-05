import type { Tab } from './types.js';
import type { ConnectionView, PendingQuestionView, ScheduleView, TabView } from '../protocol.js';
import type { Managers } from '../managers.js';
import type { TabPluginDeclaration } from '../plugins/api.js';
import path from 'node:path';
import { flattenBuffer } from './formatting.js';

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
    (label) => managers.remote.reconnectingOf(label),
    (dir) => managers.workspace.provisioning(dir),
    (pluginId) => managers.plugins.declarations.find((declaration) => declaration.id === pluginId),
  ));
}

type DeclaredViewFields = Pick<TabPluginDeclaration, 'chords' | 'hostsCommandBar'>;

// The declaration facts a plugin tab's view carries. Each is omitted rather than sent empty or false,
// so a plugin that claims nothing costs no bytes on every state broadcast, and so the client can tell
// "claims none" from "the host did not say".
function declaredFields(
  declaration: DeclaredViewFields | undefined,
): { chords?: readonly string[]; hostsCommandBar?: true } {
  const claimed = declaration?.chords;
  return {
    ...(claimed && claimed.length > 0 && { chords: claimed }),
    ...(declaration?.hostsCommandBar === true && { hostsCommandBar: true }),
  };
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
  // Resolved here rather than marked onto the tab: the channel's recovery state belongs to
  // `RemoteManager`, and a copy of it on the tab is a copy that can outlive the recovery.
  reconnectingOf?: (label: string) => boolean,
  // Whether a local clone into the given directory is still in flight — the only provisioning
  // signal a local `agent --workspace` tab has, since it carries no harness status.
  workspaceProvisioning?: (dir: string) => boolean,
  // The plugin's declaration, for the chord ids it claimed and whether it hosts the command bar.
  // Carried with the tab rather than looked up on the client, so a client holding its own copy is
  // never a second place for either to drift from the declaration the host actually enforces.
  declarationOf?: (pluginId: string) => DeclaredViewFields | undefined,
): TabView {
  const workspacePrefix = tab.workspaceDir ?? (tab.remote ? workspaceOf?.(tab.label) : undefined);
  const remoteProvisioning = workspaceOf !== undefined && tab.remote !== undefined
    && workspaceOf(tab.label) === undefined;
  const provisioning = provisioningFlag(tab, remoteProvisioning, workspaceProvisioning);
  return {
    label: tab.label,
    number: tab.number,
    dotColor: tab.dotColor,
    group: tab.group,
    groupColor: tab.groupColor,
    // A plugin lights its own tab's dot through `setBusy`, beside the host's runtime flag.
    busy: busy || tab.plugin?.busy === true,
    hasUnread: !!tab.hasUnread,
    cwd: shorten(cwd),
    cwdDisplay: workspaceCwdDisplay(cwd, workspacePrefix),
    // A remote tab is workspaced too — its clone just lives on the other host, so the flag is
    // derived from either field rather than from `workspaceDir` alone. The provisioning spinner
    // stands in for it until the workspace lands.
    flags: [
      ...provisioning,
      ...(provisioning.length === 0 && (tab.workspaceDir || tab.remote) ? ['workspaced'] : []),
      ...autoApproveFlag(tab),
      ...autoResumeFlag(tab),
      ...browserFlag(tab),
    ],
    // Present only when true, so a healthy tab's target is exactly what it was before the flag.
    remote: tab.remote && {
      ...tab.remote,
      // Recovery-ish channel facts: neither belongs on what `profile save` persists, and neither can
      // be answered from the tab. `provisioning` is the channel's own workspace-absence test — the
      // one detach refuses on — read beside `reconnectingOf` from the same lookup the workspace
      // prefix already uses.
      ...(reconnectingOf?.(tab.label) === true && { reconnecting: true }),
      ...(remoteProvisioning && { provisioning: true }),
    },
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
      ...declaredFields(declarationOf?.(tab.plugin.id)),
    } : undefined,
    harness: tab.harness,
    editor: tab.editor ? { ...tab.editor, path: shorten(tab.editor.path) } : undefined,
    // Deliberately NOT spreading `tab.editorDraft` here: the transient unsaved buffer is
    // server-only and must never be broadcast back to clients (see editor-live-buffer-sync plan).
    // Same for `tab.pageSnapshot`: the visible-text cache a plugin writes through `snapshotTab` is
    // server-only, read by monitor page feeds, and must never be broadcast back to clients.
    // And for `tab.sessionTerminated`: that copy is the server's own gate on a dead remote session, with
    // no client reader. The copy the client does get is `harness.sessionTerminated`, passed through above.

    monitor: tab.monitor,
    files: tab.files ? { ...tab.files, root: shorten(tab.files.root), absoluteRoot: tab.files.root } : undefined,
    activePty: tab.activePty,
    dock: tab.dock,
    pane: tab.pane,
  };
}

// The metadata row's animated provisioning flag, in the workspace flag's place so the box replaces it
// once provisioning ends. Lit while the tab's workspace is still being provisioned — a harness placeholder with no
// PTY yet, a remote channel with no workspace yet, or a local clone still in flight — and dropped once
// it lands or a harness records why it never will. Derived at view time, so it stops on the same
// broadcast that ends provisioning. See the Metadata row in `product/specs/tabs.md`.
function provisioningFlag(
  tab: Tab, remoteProvisioning: boolean, workspaceProvisioning?: (dir: string) => boolean,
): string[] {
  if (tab.harness?.provisionError !== undefined) return [];
  const provisioning = tab.harness?.status === 'provisioning' || remoteProvisioning
    || (tab.workspaceDir !== undefined && workspaceProvisioning?.(tab.workspaceDir) === true);
  return provisioning ? ['provisioning'] : [];
}

// The metadata row's auto-approve flag. `autoApproved` once auto-approve has cleared a permission
// prompt in the tab, which the row lights green; `autoApprove` before then.
function autoApproveFlag(tab: Tab): string[] {
  if (!tab.autoApprove) return [];
  return tab.harness?.autoApproved ? ['autoApproved'] : ['autoApprove'];
}

// The metadata row's auto-resume flag. `autoResuming` while a scheduled resume is waiting, which
// the row lights green; `autoResume` while merely armed and again once the resume has been typed in.
function autoResumeFlag(tab: Tab): string[] {
  if (!tab.autoResume) return [];
  return tab.harness?.autoResumeState === 'scheduled' ? ['autoResuming'] : ['autoResume'];
}

// The metadata row's browser flag. `browserInUse` while a browser is running behind the tab's
// endpoint, whichever start brought it up — a fresh one after a death included. Otherwise it reports
// the tab's launch: `tab.browser` is set from `-b` at spawn and left set afterwards (`profile save`
// reads it), so a `-b` tab shows `browser` before any browser exists and again once a browser is
// reported gone — the band, not the flag, carries the death. See the Metadata row in
// `product/specs/tabs.md`.
function browserFlag(tab: Tab): string[] {
  if (!tab.browser) return [];
  return tab.harness?.browserRunning ? ['browserInUse'] : ['browser'];
}

// The metadata row's display symbol for a workspaced tab's working directory: the clone's own name
// after `$workspace` at the clone root (`$workspace/salih`), continuing with the path below it
// (`$workspace/salih/notes`) — local and remote clones alike, since a remote clone
// is a path the local `$root` abbreviation could never shorten. Naming the clone is what keeps a
// strip of parallel workspaced agents distinguishable. Undefined when no workspace prefix applies
// or the cwd leaves the clone; display-only, so `cwd` keeps the value every other consumer reads.
function workspaceCwdDisplay(cwd: string, workspace?: string): string | undefined {
  if (!workspace) return undefined;
  const name = path.basename(workspace);
  if (cwd === workspace) return `$workspace/${name}`;
  if (cwd.startsWith(workspace + path.sep)) {
    const relative = path.relative(workspace, cwd).split(path.sep).join('/');
    return `$workspace/${name}${relative ? `/${relative}` : ''}`;
  }
  return undefined;
}
