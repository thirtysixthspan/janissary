import type { Managers } from '../managers.js';
import {
  TabPluginRejection,
  type TabPluginActivation,
  type TabPluginDeclaration,
  type TabPluginServerCapabilities,
} from './api.js';
import { createPluginContext } from './context.js';
import type { PluginFailureOrigin } from './failure.js';
import { guardPluginCall } from './guard.js';

// What one guarded host-to-plugin call produced. `rejected` is the plugin answering a bad request
// and staying enabled; `failed` is the plugin itself breaking and crossing the failure boundary.
export type PluginCallOutcome<Result> =
  | { status: 'ok'; value: Result }
  | { status: 'rejected'; reason: string }
  | { status: 'failed'; error: unknown };

// Runs every queued `openClaimedFiles` target through the host's ordinary `open` pipeline, pinned to
// this plugin's own opener so a declared command can never route a file to somebody else's opener.
// Sequential, so a multi-file glob keeps the sorted order `expandGlob` produced.
async function runOpenRequests(
  managers: Managers,
  declaration: TabPluginDeclaration,
  origin: PluginFailureOrigin,
  targets: readonly string[],
): Promise<void> {
  for (const target of targets) {
    await managers.openFile.runAs(`open ${target}`, origin.command, origin.label, declaration.id);
  }
}

export async function invokePlugin<Result>(
  managers: Managers,
  declaration: TabPluginDeclaration,
  activation: TabPluginActivation,
  origin: PluginFailureOrigin,
  isEnabled: () => boolean,
  timeoutMs: number,
  call: (capabilities: TabPluginServerCapabilities) => Result | Promise<Result>,
): Promise<PluginCallOutcome<Result>> {
  const openRequests: string[] = [];
  const capabilities = createPluginContext(
    managers, declaration, activation, origin, isEnabled, openRequests,
  );

  let value: Result;
  try {
    value = await guardPluginCall(() => call(capabilities), timeoutMs);
  } catch (error) {
    if (error instanceof TabPluginRejection) return { status: 'rejected', reason: error.message };
    return { status: 'failed', error };
  }

  // Deliberately outside the guarded call: the host owns glob expansion and per-file dispatch, so
  // that work must not count against the plugin's own budget or be attributed to it on timeout.
  if (isEnabled()) await runOpenRequests(managers, declaration, origin, openRequests);
  return { status: 'ok', value };
}
