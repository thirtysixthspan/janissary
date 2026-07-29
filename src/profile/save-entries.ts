import path from 'node:path';
import { abbreviatePath } from '../paths.js';
import { SYNC_WORKSPACE_NAME } from '../git-sync.js';
import type { Tab } from '../types.js';
import type {
  ProfileAgentTabFile, ProfileEditorTabFile, ProfileHarnessTabFile, ProfileImageTabFile,
  ProfileMarkdownTabFile, ProfilePageTabFile, ProfileSshTabFile, ProfileTabPresentation,
} from './types.js';
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

export function writeAgentEntry(tab: Tab, managers: Managers): ProfileAgentTabFile {
  const cwd = managers.tab.cwdOf(tab.label);
  return {
    type: 'agent',
    name: tab.label,
    active: false,
    cwd: cwd ? portablePath(cwd, managers) : cwd,
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
  const cwd = managers.tab.cwdOf(tab.label);
  return {
    type: 'harness',
    name: tab.label,
    tool: harness.name,
    model: harness.model,
    effort: harness.effort,
    workspace: tab.workspaceDir !== undefined,
    offline: tab.offline,
    autoApprove: tab.autoApprove,
    cwd: cwd ? portablePath(cwd, managers) : cwd,
    ...presentation(tab, managers),
  };
}

export function writeImageEntry(tab: Tab, managers: Managers): ProfileImageTabFile | undefined {
  if (!tab.image) return undefined;
  return { type: 'image', path: portablePath(tab.image.path, managers), ...presentation(tab, managers) };
}

export function writeMarkdownEntry(tab: Tab, managers: Managers): ProfileMarkdownTabFile | undefined {
  if (!tab.markdown) return undefined;
  return { type: 'markdown', path: portablePath(tab.markdown.path, managers), ...presentation(tab, managers) };
}

export function writePageEntry(tab: Tab, managers: Managers): ProfilePageTabFile | undefined {
  if (!tab.page) return undefined;
  return { type: 'page', url: tab.page.url, ...presentation(tab, managers) };
}

export function writeSshEntry(tab: Tab, managers: Managers): ProfileSshTabFile | undefined {
  const harness = tab.harness;
  if (!harness?.destination) return undefined;
  return {
    type: 'ssh', destination: harness.destination, options: harness.sshOptions,
    ...presentation(tab, managers),
  };
}
