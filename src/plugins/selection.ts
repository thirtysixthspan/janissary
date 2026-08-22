import {
  TabPluginRejection,
  type TabPluginActivation,
  type TabPluginDeclaration,
  type TabPluginServerCapabilities,
} from './api.js';
import type { PluginFailureOrigin } from './failure.js';
import type { PluginRequestPort } from './requests.js';

// The third host-to-plugin entry point, beside an opener/command and a tab-bound intent: the entry a
// declaration contributes for a whole file navigator selection. It lives here rather than on the
// host for the same reason `requests.ts` does — the host owns activation, guarding, and disabling,
// and each entry point owns only what it means.
//
// The paths were resolved by the caller against the navigator's own root and the plugin was derived
// from them, so nothing a client sent reaches the plugin unchecked. Both refusals below are
// rejections rather than failures: an action name the declaration does not carry is a bad request,
// and a declaration with an entry but no handler was already refused at activation, so a plugin
// reaching here without one has been rebuilt underneath a menu the user had already opened.
function invokeSelectionAction(
  declaration: TabPluginDeclaration,
  activation: TabPluginActivation,
  action: string,
  paths: readonly string[],
  capabilities: TabPluginServerCapabilities,
): void | Promise<void> {
  if (declaration.selectionAction?.action !== action) {
    throw new TabPluginRejection(`Tab plugin "${declaration.id}" contributes no selection action "${action}"`);
  }
  if (!activation.selectionAction) {
    throw new TabPluginRejection(`Tab plugin "${declaration.id}" contributes a selection action but provides no handler`);
  }
  return activation.selectionAction(paths, capabilities);
}

// A rejection has no waiting client here — the navigator sent the request and moved on — so it goes
// to the transcript of the tab the menu was opened from, exactly as a rejected command does.
function note(port: PluginRequestPort, origin: PluginFailureOrigin, output: string): void {
  if (port.managers.tab.tabs.some((tab) => tab.label === origin.label)) {
    port.managers.tab.append(origin.label, { input: origin.command, output });
  }
}

export async function runPluginSelectionAction(
  port: PluginRequestPort,
  id: string,
  action: string,
  paths: readonly string[],
  origin: PluginFailureOrigin,
): Promise<void> {
  const record = port.record(id);
  if (!record) return;
  const activation = await port.ensureActive(record, origin);
  if (!activation) return;
  const outcome = await port.invoke(record, activation, origin, (capabilities) =>
    invokeSelectionAction(record.declaration, activation, action, paths, capabilities));
  if (outcome.status === 'failed') port.disable(record, outcome.error, origin);
  else if (outcome.status === 'rejected') note(port, origin, outcome.reason);
}
