import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { abbreviatePath } from '../paths.js';
import type { AgentState, ProfileHarnessEntry, Tab } from '../types.js';
import type { Managers } from '../managers.js';

// Entry writers for `profile save`: the inverse of the agent-state/harness-entry loaders. Each
// writes a clean reusable template — no transcript/history fields — named `<tab.label>.json`
// (the filename is the authoritative label on read, so `name`/`label` inside the file is
// informational only). `JSON.stringify` drops `undefined`-valued fields on its own, so an
// unset optional (e.g. `cwd`, `model`) is simply omitted rather than written as `null`.

export function writeAgentEntry(dir: string, tab: Tab, managers: Managers): void {
  const cwd = managers.tab.cwdOf(tab.label);
  const entry: AgentState = {
    name: tab.label,
    dotColor: tab.dotColor,
    active: false,
    number: tab.number,
    group: tab.group,
    groupColor: tab.groupColor,
    cwd: cwd ? abbreviatePath(cwd, { root: managers.tab.launchDir }) : cwd,
  };
  writeFileSync(path.join(dir, `${tab.label}.json`), JSON.stringify(entry, null, 2));
}

export function writeHarnessEntry(dir: string, tab: Tab, managers: Managers): void {
  const harness = tab.harness;
  if (!harness) return;
  const cwd = managers.tab.cwdOf(tab.label);
  const entry: Omit<ProfileHarnessEntry, 'label'> = {
    harness: harness.name,
    model: harness.model,
    effort: harness.effort,
    workspace: tab.workspaceDir !== undefined,
    offline: tab.offline,
    autoApprove: tab.autoApprove,
    dotColor: tab.dotColor,
    cwd: cwd ? abbreviatePath(cwd, { root: managers.tab.launchDir }) : cwd,
    number: tab.number,
    group: tab.group,
  };
  writeFileSync(path.join(dir, `${tab.label}.json`), JSON.stringify(entry, null, 2));
}
