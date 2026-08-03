import type { TabPluginActivation, TabPluginDeclaration } from './api.js';

// What `plugins` prints and what the host records per plugin. `declared` has never been imported,
// `active` has been activated successfully, `disabled` has crossed the failure boundary and stays
// that way until the process restarts.
export type TabPluginStatus = {
  state: 'declared' | 'active' | 'disabled';
  activationMs?: number;
  reason?: string;
};

// The host's private per-plugin bookkeeping: the public status plus the activation itself and the
// one in-flight activation promise that concurrent first requests share.
export type PluginRecord = TabPluginStatus & {
  declaration: TabPluginDeclaration;
  activation?: TabPluginActivation;
  activating?: Promise<TabPluginActivation | undefined>;
  activationDisposed?: boolean;
};

// Projects a record down to the public status, dropping the optional fields when unset so callers
// never see `activationMs: undefined` on a plugin that has not activated.
export function recordStatus(record: PluginRecord): TabPluginStatus {
  return {
    state: record.state,
    ...(record.activationMs !== undefined && { activationMs: record.activationMs }),
    ...(record.reason !== undefined && { reason: record.reason }),
  };
}
