import type { Subscription } from '../bus.js';
import type { PluginRecord } from './status.js';
import { disposePluginActivation } from './activate.js';
import { releasePluginRemoteResources } from './remote-capabilities.js';

export function disposePluginRecord(record: PluginRecord): void {
  if (!record.activation || record.activationDisposed) return;
  record.activationDisposed = true;
  disposePluginActivation(record.activation);
  record.activation = undefined;
}

export function disposePluginHost(
  subscriptions: readonly Subscription[],
  records: Iterable<PluginRecord>,
): void {
  for (const subscription of subscriptions) subscription.unsubscribe();
  releasePluginRemoteResources();
  for (const record of records) disposePluginRecord(record);
}
