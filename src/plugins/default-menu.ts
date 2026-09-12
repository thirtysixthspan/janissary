import {
  TabPluginRejection,
  type TabPluginActivation,
  type TabPluginDeclaration,
  type TabPluginServerCapabilities,
} from './api.js';
import type { PluginFailureOrigin } from './failure.js';
import type { PluginRequestPort } from './requests.js';

// The default context menu's own entry point, beside an opener/command, a tab-bound intent, and the
// file navigator's selection action. Shaped on `selection.ts`: the host owns activation, guarding,
// and disabling, and this module owns only what contributing to the default menu means.
//
// The label the client sent back is checked against the declaration rather than trusted — the run
// RPC carries it, so anything else the client could name was never offered to it by anyone. Unlike
// a navigator selection there is no owner tree to derive a plugin from, so resolution either
// answers exactly one contribution or none.
export function defaultMenuActionFor(
  declarations: readonly TabPluginDeclaration[],
): { plugin: string; label: string } | null {
  const contributions = declarations.flatMap((declaration) => declaration.defaultMenu
    ? [{ plugin: declaration.id, label: declaration.defaultMenu.label }]
    : []);
  return contributions.length === 1 ? contributions[0] : null;
}

function invokeDefaultMenuAction(
  declaration: TabPluginDeclaration,
  activation: TabPluginActivation,
  action: string,
  selection: string,
  capabilities: TabPluginServerCapabilities,
): void | Promise<void> {
  if (declaration.defaultMenu?.label !== action) {
    throw new TabPluginRejection(
      `Tab plugin "${declaration.id}" contributes no default-menu action "${action}"`,
    );
  }
  if (!activation.defaultMenuAction) {
    throw new TabPluginRejection(
      `Tab plugin "${declaration.id}" contributes a default-menu action but provides no handler`,
    );
  }
  return activation.defaultMenuAction(selection, capabilities);
}

// A rejection has no waiting client here — the menu sent the request and closed — so it goes to the
// transcript of the tab the menu was raised from, exactly as a rejected command does.
function note(port: PluginRequestPort, origin: PluginFailureOrigin, output: string): void {
  if (port.managers.tab.tabs.some((tab) => tab.label === origin.label)) {
    port.managers.tab.append(origin.label, { input: origin.command, output });
  }
}

export async function runPluginDefaultMenuAction(
  port: PluginRequestPort,
  id: string,
  action: string,
  selection: string,
  origin: PluginFailureOrigin,
): Promise<void> {
  const record = port.record(id);
  if (!record) return;
  const activation = await port.ensureActive(record, origin);
  if (!activation) return;
  const outcome = await port.invoke(record, activation, origin, (capabilities) =>
    invokeDefaultMenuAction(record.declaration, activation, action, selection, capabilities));
  if (outcome.status === 'failed') port.disable(record, outcome.error, origin);
  else if (outcome.status === 'rejected') note(port, origin, outcome.reason);
}
