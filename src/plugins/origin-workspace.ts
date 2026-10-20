import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';
import type { OriginWorkspace } from './api-origin-tab.js';
import { goneWorkspace, localWorkspace, remoteWorkspace } from './origin-workspace-records.js';
import { agentMonitorWorkspace, editorWorkspace, navigatorWorkspace } from './origin-workspace-kinds.js';
import { agentMonitorManifest } from './agent-monitor/manifest.js';

export type OriginWorkspaceAnswer = { workspace?: OriginWorkspace; provisioning: boolean; workspaceLabel?: string };

// Which workspace a tab is in, answered in one place so every plugin reads the same thing from
// `originTab()`. Covers shell and harness tabs (and any tab carrying a clone or a remote target),
// plugin tabs riding a remote channel, agent monitors, editors, and file navigators; every other
// tab answers no workspace.
export function originWorkspace(managers: Managers, tab: Tab): OriginWorkspaceAnswer {
  if (tab.workspaceDir !== undefined) return localWorkspace(managers, tab.workspaceDir, tab.offline ?? false);
  if (tab.plugin?.id === agentMonitorManifest.id) return agentMonitorWorkspace(managers, tab);
  if (tab.view === 'editor' && tab.editor) return editorWorkspace(managers, tab);
  if (tab.view === 'files' && tab.files) return navigatorWorkspace(managers, tab);
  if (!tab.remote) return { provisioning: false };
  const riding = tab.plugin !== undefined && tab.plugin.id !== 'shell' && tab.view !== 'harness';
  if (riding) return ridingWorkspace(managers, tab);
  const workspace = remoteWorkspace(managers, tab);
  if (workspace) return { workspace, provisioning: false };
  return { provisioning: true, ...labelOf(managers, tab.label) };
}

// A joined plugin tab: the channel's workspace while it lives, a gone record once it has ended.
// `gone` wins over provisioning.
function ridingWorkspace(managers: Managers, tab: Tab): OriginWorkspaceAnswer {
  if (managers.remote?.get?.(tab.label) === undefined) {
    return { workspace: goneWorkspace('', tab.label), provisioning: false };
  }
  const workspace = remoteWorkspace(managers, tab);
  if (tab.sessionTerminated !== undefined) {
    if (!workspace) return { workspace: goneWorkspace('', tab.label), provisioning: false };
    const { dir, label, ride, host } = workspace;
    return { workspace: { ...goneWorkspace(dir, label), ride, ...(host !== undefined && { host }) }, provisioning: false };
  }
  if (workspace) return { workspace, provisioning: false };
  return { provisioning: true, ...labelOf(managers, tab.label) };
}

function labelOf(managers: Managers, label: string): { workspaceLabel?: string } {
  const workspaceLabel = managers.remote?.workspaceLabelOf?.(label);
  return workspaceLabel === undefined ? {} : { workspaceLabel };
}
