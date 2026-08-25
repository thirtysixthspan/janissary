import path from 'node:path';
import { abbreviatePath } from '../paths.js';
import { SYNC_WORKSPACE_NAME } from '../git-sync.js';
import type { Tab } from '../tab/types.js';
import type {
  ProfileAgentTabFile, ProfileEditorTabFile, ProfileFilesTabFile, ProfileHarnessTabFile,
  ProfilePluginTabFile, ProfileSshTabFile,
  ProfileTabPresentation,
} from './types.js';
import type { TabPluginDeclaration } from '../plugins/api.js';
import type { TreeSelection } from '../file-navigator/selection-request.js';
import type { Managers } from '../managers.js';
import { centerPane } from '../tab/split.js';

// Entry builders for `profile save`: the inverse of the loader's partitioning pass. Each returns
// one element of the profile's `tabs` array, carrying its `type` discriminator, the flat tab
// presentation (`dotColor` → `color`), and whatever else its kind needs — for an agent or harness,
// its own `name` (the tab label), since an array element has no filename to derive one from.
// `JSON.stringify` drops `undefined`-valued fields on its own, so an unset optional (e.g. `cwd`,
// `model`) is simply omitted rather than written as `null`.

function presentation(tab: Tab, managers: Managers): ProfileTabPresentation {
  return {
    color: tab.dotColor, number: tab.number,
    focus: tab === managers.tab.tabs[managers.tab.activeTab] || undefined,
    group: tab.group, groupColor: tab.groupColor, pane: centerPane(tab),
  };
}

// A path under the project root is written as `$root/...` so a saved profile stays portable.
function portablePath(target: string, managers: Managers): string {
  return abbreviatePath(target, { root: managers.tab.launchDir });
}

// A remote tab's working directory is a path on another machine: neither under the local project
// root (so `portablePath` cannot make it portable) nor meaningful here. Such an entry omits `cwd`
// entirely and lets the remote server resolve a fresh workspace at launch.
function entryCwd(tab: Tab, managers: Managers): string | undefined {
  if (tab.remote) return undefined;
  const cwd = managers.tab.cwdOf(tab.label);
  return cwd ? portablePath(cwd, managers) : cwd;
}

export function writeAgentEntry(tab: Tab, managers: Managers): ProfileAgentTabFile {
  return {
    type: 'agent',
    name: tab.label,
    active: false,
    remote: tab.remote?.address,
    cwd: entryCwd(tab, managers),
    ...presentation(tab, managers),
  };
}

export function writeEditorEntry(tab: Tab, managers: Managers): ProfileEditorTabFile | undefined {
  if (!tab.editor) return undefined;
  const source = syncedSourcePath(tab.editor, managers.tab.launchDir);
  return {
    type: 'editor',
    path: source ?? portablePath(tab.editor.path, managers),
    ...presentation(tab, managers),
  };
}

// A synced editor's on-disk path lives inside the shared git-sync workspace clone, not under the
// project root, so abbreviatePath can't make it portable (see the plan's Design decisions).
// Capture the project-relative source path instead — the same form OpenFileManager.edit()'s
// isSyncPath check already recognizes on reload, so profile launch re-provisions the shared
// workspace instead of opening a path inside a clone that may not exist yet.
function syncedSourcePath(editor: NonNullable<Tab['editor']>, launchDir: string): string | undefined {
  if (!editor.sync) return undefined;
  const workspaceDir = path.join(launchDir, '.janissary', 'workspace', SYNC_WORKSPACE_NAME);
  const relative = path.relative(workspaceDir, editor.path).split(path.sep).join('/');
  return `$root/${relative}`;
}

export function writeHarnessEntry(tab: Tab, managers: Managers): ProfileHarnessTabFile | undefined {
  const harness = tab.harness;
  if (!harness) return undefined;
  return {
    type: 'harness',
    name: tab.label,
    tool: harness.name,
    model: harness.model,
    effort: harness.effort,
    remote: tab.remote?.address,
    // A remote tab leaves `workspaceDir` unset on purpose (its clone is the remote's), so the flag
    // is derived from either field — `on <address>` always launches workspaced.
    workspace: tab.workspaceDir !== undefined || tab.remote !== undefined,
    offline: tab.offline,
    autoApprove: tab.autoApprove,
    cwd: entryCwd(tab, managers),
    ...presentation(tab, managers),
  };
}

// A file navigator, docked or not. A docked tree has no place in the tab strip, so it keeps `dock`
// and gets no presentation; an undocked one carries the usual presentation keys instead, so it
// reopens in its saved group, order, and pane. `expanded` and `details` come from server state and
// always write, except that the default `name` detail mode writes no key at all; the three
// selection keys are whatever the client reported in time (see
// `file-navigator/selection-request.ts`), and an absent or empty one is simply omitted.
export function writeFilesEntry(
  tab: Tab, managers: Managers, selection: TreeSelection | undefined,
): ProfileFilesTabFile | undefined {
  if (!tab.files) return undefined;
  const expanded = managers.fileNavigator.expandedPaths(tab.label);
  const selected = selection?.selected ?? [];
  const details = managers.fileNavigator.detailOf(tab.label);
  return {
    type: 'files',
    dock: tab.dock,
    path: portablePath(tab.files.absoluteRoot, managers),
    details: details === 'name' ? undefined : details,
    expanded: expanded.length > 0 ? expanded : undefined,
    cursor: selection?.cursor,
    anchor: selection?.anchor,
    selected: selected.length > 0 ? selected : undefined,
    ...(!tab.dock && presentation(tab, managers)),
  };
}

// What a plugin tab's instance key names, which decides how its entry is written and how a relaunch
// reopens it. Read off the declaration rather than guessed from the key: whether a plugin opens on
// files, on web addresses, or on neither is something it declared.
function instanceKeyKind(
  declaration: TabPluginDeclaration | undefined,
): 'file' | 'web' | 'none' {
  if (Object.keys(declaration?.fileExtensions ?? {}).length > 0) return 'file';
  return declaration?.webTargets ? 'web' : 'none';
}

// A bundled-plugin tab. For a plugin that opens on files the instance key is the file it opened,
// which is all a relaunch needs: `open <path>` routes back to the same plugin through the opener
// registry. For one that opens on web addresses the key is the address, written verbatim — an
// address is not a path and must not be abbreviated against the project root. A plugin claiming
// neither was reached by its command and has nothing to name, so its entry omits `path` and relaunch
// reissues that command. A docked plugin tab has no place in the tab strip, so — like a docked
// navigator — it keeps `dock` and gets no presentation.
export function writePluginEntry(tab: Tab, managers: Managers): ProfilePluginTabFile | undefined {
  if (!tab.plugin) return undefined;
  const id = tab.plugin.id;
  const key = tab.plugin.instanceKey;
  const kind = instanceKeyKind(managers.plugins.declarations.find((entry) => entry.id === id));
  return {
    type: 'plugin', id,
    path: kind === 'file' ? portablePath(key, managers) : (kind === 'web' ? key : undefined),
    dock: tab.dock,
    ...(!tab.dock && presentation(tab, managers)),
  };
}

export function writeSshEntry(tab: Tab, managers: Managers): ProfileSshTabFile | undefined {
  const harness = tab.harness;
  if (!harness?.destination) return undefined;
  return {
    type: 'ssh', destination: harness.destination, options: harness.sshOptions,
    ...presentation(tab, managers),
  };
}
