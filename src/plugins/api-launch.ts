import type { TabPluginPayload, TabPluginResources, TabPluginServerCapabilities } from './api.js';

// The `launchTab` half of the v1 contract: a tab the host names, places, and — when asked — gives a
// workspace clone of its own, finishing it through the plugin's ready handler once the clone lands.
// Re-exported from `api.ts`, so a plugin still imports the whole contract from one module.

export type TabPluginLaunchRequest = {
  // A typed name. Held to the same name checks an agent launch is; absent, the host draws one.
  name?: string;
  // Ask for a fresh workspace clone. Without a repository the launch still opens, unconfined, and
  // the result says why.
  workspace?: { offline: boolean };
};

// Where the launched tab starts, decided by the host before the factory runs.
export type TabPluginLaunchStart = {
  label: string;
  cwd: string;
  // Present while a clone is provisioning: the factory then starts nothing and the ready handler
  // finishes the tab.
  workspaceDir?: string;
};

export type TabPluginLaunchReady = {
  instanceKey: string;
  workspaceDir: string;
  // The clone directory shortened for display, as an agent launch's ready line shows it.
  displayDir: string;
  // Present when the clone's Seatbelt confinement is not actually active.
  sandboxNotice?: string;
};

export type TabPluginLaunchResult = {
  label: string;
  // Why a requested workspace was not created, when the launch fell back to an unconfined tab.
  fallbackReason?: string;
};

export type TabPluginLaunchFactory = (
  resources: TabPluginResources, start: TabPluginLaunchStart,
) => TabPluginPayload;

export type TabPluginLaunchReadyHandler = (
  event: TabPluginLaunchReady, capabilities: TabPluginServerCapabilities,
) => void | Promise<void>;
