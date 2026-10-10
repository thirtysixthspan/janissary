import type { TabPluginServerCapabilities } from '../api.js';
import type { ChangeSetResult } from './change-set.js';
import { isChangeSetResult } from './change-set.js';

// The remote half of a change-set read. The directory lives on another machine, so the read happens
// there and its answer travels back through the capability the host publishes for it; everything
// after that is the local recompute's own, which is why one module is the whole of it.
//
// The answer is checked before it is believed. It crossed a channel, so it is a value from another
// process rather than one this plugin produced, and a malformed one is reported as the tab's error
// state rather than published.

const UNUSABLE_ANSWER = 'The remote host did not answer with a change set.';

export async function readRemoteChangeSet(
  capabilities: TabPluginServerCapabilities, fullFiles: ReadonlySet<string>,
): Promise<ChangeSetResult> {
  // A far side that throws is indistinguishable from one that answered unusably: both are a host that
  // did not give this plugin a change set, and the tab's error state says exactly that.
  let value: unknown;
  try {
    const answer = capabilities.readWorkspaceChangeSet([...fullFiles]);
    value = answer === null ? undefined : await answer;
  } catch {
    return { kind: 'error', reason: UNUSABLE_ANSWER };
  }
  return isChangeSetResult(value) ? value : { kind: 'error', reason: UNUSABLE_ANSWER };
}
