import { abbreviatePath } from '../paths.js';
import type { ProfileAgentFile, ProfileHarnessFile, Tab } from '../types.js';
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
    tab: { color: tab.dotColor, number: tab.number, group: tab.group, groupColor: tab.groupColor },
  };
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
    tab: { color: tab.dotColor, number: tab.number, group: tab.group },
  };
}
