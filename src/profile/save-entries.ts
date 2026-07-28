import path from 'node:path';
import { abbreviatePath } from '../paths.js';
import { SYNC_WORKSPACE_NAME } from '../git-sync.js';
import type { ProfileAgentFile, ProfileEditorsEntry, ProfileHarnessFile, Tab } from '../types.js';
import type { Managers } from '../managers.js';

// Entry builders for `profile save`: the inverse of the agent-state/harness-entry loaders. Each
// returns a clean reusable template — no transcript/history fields — carrying its own `name` (the
// tab label) since an array element has no filename to derive it from, and folding the tab's
// presentation into a nested `tab` object (`dotColor` → `color`) per Decision 14. `JSON.stringify`
// drops `undefined`-valued fields on its own, so an unset optional (e.g. `cwd`, `model`) is simply
// omitted rather than written as `null`.

export function writeAgentEntry(tab: Tab, managers: Managers): ProfileAgentFile {
  const cwd = managers.tab.cwdOf(tab.label);
  return {
    name: tab.label,
    active: false,
    cwd: cwd ? abbreviatePath(cwd, { root: managers.tab.launchDir }) : cwd,
    tab: { color: tab.dotColor, number: tab.number, focus: tab === managers.tab.tabs[managers.tab.activeTab] || undefined, group: tab.group, groupColor: tab.groupColor },
  };
}

export function writeEditorEntry(tab: Tab, managers: Managers): ProfileEditorsEntry | undefined {
  if (!tab.editor) return undefined;
  const source = syncedSourcePath(tab.editor, managers.tab.launchDir);
  return {
    path: source ?? abbreviatePath(tab.editor.path, { root: managers.tab.launchDir }),
    tab: { color: tab.dotColor, number: tab.number, focus: tab === managers.tab.tabs[managers.tab.activeTab] || undefined, group: tab.group, groupColor: tab.groupColor },
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

export function writeHarnessEntry(tab: Tab, managers: Managers): ProfileHarnessFile | undefined {
  const harness = tab.harness;
  if (!harness) return undefined;
  const cwd = managers.tab.cwdOf(tab.label);
  return {
    name: tab.label,
    type: harness.name,
    model: harness.model,
    effort: harness.effort,
    workspace: tab.workspaceDir !== undefined,
    offline: tab.offline,
    autoApprove: tab.autoApprove,
    cwd: cwd ? abbreviatePath(cwd, { root: managers.tab.launchDir }) : cwd,
    tab: { color: tab.dotColor, number: tab.number, focus: tab === managers.tab.tabs[managers.tab.activeTab] || undefined, group: tab.group },
  };
}
