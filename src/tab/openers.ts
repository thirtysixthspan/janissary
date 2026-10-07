import type { Tab, EditorView, FileNavigatorView } from './types.js';
import type {
  TabPluginPayload, TabPluginResources, TabPluginTabUpdate,
  TabPluginTerminal, TabPluginTerminalOptions,
} from '../plugins/api.js';
import { messageBus } from '../bus.js';
import {
  addPluginTab, addEditorTab, addFilesTab, addNotificationsTab,
} from './creators.js';
import { releaseFileReference } from './file-registry.js';
import { tabRuntime } from './runtime.js';
import type { LaunchNameRow } from '../launch-name/check.js';
import { terminalConfinement, type TabClone } from './terminal-workspace.js';

// What a host-owned launch fixes about a plugin tab before its factory runs: the label, the
// directory it starts in, and the workspace clone it owns from the first moment.
export type PluginTabPreset = {
  label: string;
  cwd?: string;
  workspace?: { dir: string; offline: boolean };
  remote?: { address: string; host: string };
};

// Minimal surface these openers need from the TabManager. Kept structural (rather than importing
// the TabManager type) so this module has no import cycle back to tab-manager.ts.
interface OpenTarget {
  tabs: Tab[];
  activeTab: number;
  setActiveTab(index: number): void;
  applyOpenResult(result: { tabs: Tab[]; activeTab: number }): void;
  registerFile(path: string): string;
  openFiles: Map<string, string>;
  spawnTerminal(options: TabPluginTerminalOptions): TabPluginTerminal;
  spawnRemoteTerminal(label: string, options: TabPluginTerminalOptions): TabPluginTerminal;
  remoteWorkspaceOf(label: string): { dir: string; offline: boolean } | undefined;
  adoptTerminal(ptyId: string, label: string): void;
  killTerminal(ptyId: string): void;
  recordTerminal(ptyId: string, label: string, pluginId: string): void;
  retainWorkspace(directory: string): void;
}

function activate(
  target: OpenTarget,
  result: { tabs: Tab[]; activeTab: number },
  afterApply?: () => void,
): void {
  target.applyOpenResult(result);
  afterApply?.();
  messageBus.emit('state', { type: 'dirty' });
}

// Runs a plugin factory with a registration window open around it, and reports back every reference
// it registered and the terminals it started, if any, with the directory the first of them started
// in. The window closes as soon as the factory
// returns, so a plugin that stashed the resources object cannot keep serving files or running
// processes from outside the call the host granted them for, and a factory that throws leaves nothing
// behind. Shared by the open and update paths so a reference registered through one is scoped and
// released exactly as one registered through the other.
function withResources<Result>(
  target: OpenTarget,
  factory: (resources: TabPluginResources) => Result,
  clones: { source?: TabClone; own?: TabClone },
  remoteLabel?: string,
): { result: Result; fileRefs: string[]; terminalIds: string[]; terminalCwd?: string; confinedToSource: boolean } {
  const fileRefs: string[] = [];
  const terminals: string[] = [];
  let terminalCwd: string | undefined;
  let confinedToSource = false;
  let acceptingResources = true;
  try {
    const result = factory({
      registerFile: (path) => {
        if (!acceptingResources) throw new Error('plugin tab resources are no longer available');
        const reference = target.registerFile(path);
        fileRefs.push(reference.replace(/^\/open\//, ''));
        return reference;
      },
      spawnTerminal: (options) => {
        if (!acceptingResources) throw new Error('plugin tab resources are no longer available');
        const remoteWorkspace = remoteLabel === undefined ? undefined : target.remoteWorkspaceOf(remoteLabel);
        const confinement = terminalConfinement(options.workspace, clones.source, clones.own, remoteWorkspace);
        const terminal = confinement.remote && remoteLabel !== undefined
          ? target.spawnRemoteTerminal(remoteLabel, { ...options, workspace: confinement.workspace })
          : target.spawnTerminal({ ...options, workspace: confinement.workspace });
        terminals.push(terminal.ptyId);
        terminalCwd ??= options.cwd;
        confinedToSource ||= confinement.fromSource;
        return terminal;
      },
    });
    return { result, fileRefs, terminalIds: terminals, terminalCwd, confinedToSource };
  } catch (error) {
    for (const reference of fileRefs) target.openFiles.delete(reference);
    // A factory that failed after starting a terminal must not leave the process running: no tab was
    // created, so nothing would ever close it.
    for (const ptyId of terminals) target.killTerminal(ptyId);
    throw error;
  } finally {
    acceptingResources = false;
  }
}

export function openPluginTab(
  target: OpenTarget,
  pluginId: string,
  labelPrefix: string,
  instanceKey: string,
  schemaVersion: number,
  sourceLabel: string,
  factory: (resources: TabPluginResources) => TabPluginPayload,
  agentNamed = false,
  rows: readonly LaunchNameRow[] = [],
  preset?: PluginTabPreset,
): void {
  const existing = target.tabs.find(
    (tab) => tab.plugin?.id === pluginId && tab.plugin.instanceKey === instanceKey,
  );
  if (existing) {
    target.setActiveTab(target.tabs.indexOf(existing));
    messageBus.emit('state', { type: 'dirty' });
    return;
  }
  // Every other opener runs synchronously inside its dispatch, so the active tab cannot move under
  // it. A plugin's can: the first call awaits activation, and any handler may await before opening.
  // The creating tab is the one whose transcript ran the command, so grouping resolves by
  // `sourceLabel` rather than by whatever happens to be focused when the factory finally runs.
  const sourceIndex = target.tabs.findIndex((tab) => tab.label === sourceLabel);
  const creatorIndex = sourceIndex === -1 ? target.activeTab : sourceIndex;
  const source = target.tabs[sourceIndex];
  const own = preset?.workspace && { workspaceDir: preset.workspace.dir, offline: preset.workspace.offline };
  const {
    result: created, fileRefs, terminalIds, terminalCwd, confinedToSource,
  } = withResources(target, factory, { source, own }, preset?.label);
  activate(target, addPluginTab(target.tabs, creatorIndex, labelPrefix, created.title, {
    id: pluginId,
    instanceKey,
    schemaVersion,
    payload: created.payload,
    fileRefs,
    sourceLabel,
  }, agentNamed, rows, preset?.label), () => {
    // The terminals were spawned before this tab had a label, so they are adopted onto the one just
    // minted. Adopt before publishing state so the first host-state delivery sees every terminal row.
    // Every terminal the factory started is adopted, not just the first — one left on the label it was
    // spawned under would belong to no tab, and neither the per-tab walk nor a plugin disable would
    // ever release it.
    const minted = target.tabs.find(
      (tab) => tab.plugin?.id === pluginId && tab.plugin.instanceKey === instanceKey,
    );
    if (minted !== undefined) {
      if (preset?.remote !== undefined) minted.remote = preset.remote;
      // The directory the terminal really started in, not the source's: a plugin may start it
      // elsewhere, as a shell does when its source has left the project, and the source's directory
      // would otherwise stand until zsh's first report, which never comes for an unmounted shell.
      const startCwd = terminalCwd ?? preset?.cwd;
      if (startCwd !== undefined) tabRuntime(minted).cwd = startCwd;
      // A preset clone was already counted by the `create` that started it; only a borrowed one is retained.
      if (own) {
        minted.workspaceDir = own.workspaceDir;
        minted.offline = own.offline;
      } else if (confinedToSource && source?.workspaceDir) {
        minted.workspaceDir = source.workspaceDir;
        minted.offline = source.offline;
        target.retainWorkspace(source.workspaceDir);
      }
      for (const ptyId of terminalIds) target.adoptTerminal(ptyId, minted.label);
      // Recording starts here rather than at the spawn above, and that placement is the whole reason
      // this step sits after the adoption: a recording is named for the tab that owns it, and no tab
      // owns the terminal until the label has been minted. Nothing is missed by waiting — the span
      // between the two is synchronous, and a PTY's first output reaches the host on a later turn of
      // the event loop — and in exchange the runtime is registered under its real label from the
      // first moment, so closing the tab finds it with no relabelling anywhere.
      for (const ptyId of terminalIds) target.recordTerminal(ptyId, minted.label, pluginId);
    }
  });
}


// Replaces what an already-open plugin tab shows. The tab is addressed by its owning plugin plus the
// instance key it was opened with, so a plugin can only ever write its own tab, and a key with no
// open tab leaves everything untouched. Placement never moves: the payload is replaced, the title
// only when the factory returned one, and the instance key only when the factory returned a free
// one — a key another tab of the same plugin already holds would make two tabs indistinguishable to
// every capability that addresses one, so it is refused while the rest of the update still applies.
// An update may also begin serving a file the tab did not hold before; those references join the
// tab's own `fileRefs`, so closing it releases them along with everything it opened with.
export function updatePluginTab(
  target: OpenTarget,
  pluginId: string,
  instanceKey: string,
  factory: (resources: TabPluginResources) => TabPluginTabUpdate,
): void {
  const tab = target.tabs.find(
    (candidate) => candidate.plugin?.id === pluginId && candidate.plugin.instanceKey === instanceKey,
  );
  if (!tab?.plugin) return;
  const { result: update, fileRefs, terminalIds } = withResources(target, factory, { source: tab, own: tab }, tab.label);
  const rekeyed = update.instanceKey !== undefined && update.instanceKey !== instanceKey
    && target.tabs.every((candidate) => candidate.plugin?.id !== pluginId
      || candidate.plugin.instanceKey !== update.instanceKey);
  tab.plugin = {
    ...tab.plugin,
    payload: update.payload,
    fileRefs: [...tab.plugin.fileRefs, ...fileRefs],
    ...(rekeyed && { instanceKey: update.instanceKey! }),
  };
  // This tab exists already, so every terminal the factory started is adopted onto it, and a
  // terminal started here is recorded exactly as one started while the tab was opening would be.
  for (const ptyId of terminalIds) target.adoptTerminal(ptyId, tab.label);
  for (const ptyId of terminalIds) target.recordTerminal(ptyId, tab.label, pluginId);
  if (update.title !== undefined) tab.title = update.title;
  messageBus.emit('state', { type: 'dirty' });
}

export function openEditorTab(
  target: OpenTarget, view: EditorView, watch: (label: string, path: string) => void,
): string {
  // Matched on the payload rather than the view discriminant, exactly as before — the predicate is
  // typed only so the payload stays narrowed for the line assignment below.
  const existing = view.newFile ? undefined : target.tabs.find(
    (t): t is Tab & { editor: EditorView } => t.editor?.path === view.path,
  );
  if (existing) {
    releaseFileReference(target.openFiles, view.url);
    if (view.line !== undefined) {
      existing.editor.line = view.line;
      existing.editor.lineRequest = (existing.editor.lineRequest ?? 0) + 1;
    }
    target.setActiveTab(target.tabs.indexOf(existing));
    messageBus.emit('state', { type: 'dirty' });
    return existing.label;
  }
  const result = addEditorTab(target.tabs, target.activeTab, view);
  target.applyOpenResult(result);
  watch(result.tabs[result.activeTab].label, view.path);
  messageBus.emit('state', { type: 'dirty' });
  return result.tabs[result.activeTab].label;
}

export function openFilesTab(target: OpenTarget, view: FileNavigatorView): void {
  activate(target, addFilesTab(target.tabs, target.activeTab, view));
}

export function openNotificationsTab(target: OpenTarget): void {
  activate(target, addNotificationsTab(target.tabs, target.activeTab));
}
