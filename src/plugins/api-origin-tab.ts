import type { Tab } from '../tab/types.js';

// The workspace a tab is in, as `originTab()` reports it. One definition shared by the record and
// the host resolver in `src/plugins/origin-workspace.ts`, so every plugin gets the same answer.
export type OriginWorkspace = {
  // The workspace clone's directory: local, or on the far side for a remote one. Empty for a
  // gone riding tab whose channel entry has been released.
  dir: string;
  offline?: boolean;
  // The workspace label, such as `claude-2` for `$workspace/claude-2`.
  label: string;
  // The display form, `abbreviateWorkspaceDir(dir)`, the same form launch-ready handlers get.
  display: string;
  // For a remote workspace: the label of an open tab riding its channel.
  ride?: string;
  // For a remote workspace: the host string of the riding tab's remote target.
  host?: string;
  // Set, and only then, when the tab points at a workspace that no longer exists.
  gone?: true;
};

export type TabPluginOriginTab = {
  label: string;
  cwd: string;
  root: string;
  view?: Tab['view'];
  plugin?: string;
  workspace?: OriginWorkspace;
  remote?: true;
  provisioning?: true;
  // The workspace label of a remote tab whose far side has not answered yet, set only alongside
  // `provisioning` when there is no `workspace`, so a caller can name it in a not-ready refusal.
  workspaceLabel?: string;
} | null;
