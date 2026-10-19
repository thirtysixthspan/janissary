import {
  TabPluginRejection,
  type TabPluginActivation,
  type TabPluginDeclaration,
  type TabPluginServerCapabilities,
} from './api.js';
import type { PluginFailureOrigin } from './failure.js';
import { runClientlessPluginEntry } from './clientless-entry.js';
import type { PluginRequestPort } from './requests.js';

export type DefaultMenuAction = { plugin: string; label: string; shortcut?: true };

// The default context menu's own entry point, beside an opener/command, a tab-bound intent, and the
// file navigator's selection action. Shaped on `selection.ts`: the host owns activation, guarding,
// and disabling, and this module owns only what contributing to the default menu means.
//
// The label the client sent back is checked against the declaration rather than trusted — the run
// RPC carries it, so anything else the client could name was never offered to it by anyone. Unlike
// a navigator selection there is no owner tree to derive a plugin from, so the label is the only
// identity an entry has: a label more than one plugin contributes is offered by none of them, and
// a shortcut more than one entry claims is kept by none of them.
export function defaultMenuActionsFor(
  declarations: readonly TabPluginDeclaration[],
): DefaultMenuAction[] {
  const contributions = declarations.flatMap((declaration, index) => declaration.defaultMenu
    ? [{ plugin: declaration.id, index, ...declaration.defaultMenu }]
    : []);
  const unique = contributions.filter((entry) =>
    contributions.filter((other) => other.label === entry.label).length === 1);
  const shortcutOwners = unique.filter((entry) => entry.shortcut).length;
  return unique
    .toSorted((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.index - b.index)
    .map(({ plugin, label, shortcut }) => ({
      plugin, label, ...(shortcut && shortcutOwners === 1 && { shortcut }),
    }));
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

export async function runPluginDefaultMenuAction(
  port: PluginRequestPort,
  id: string,
  action: string,
  selection: string,
  origin: PluginFailureOrigin,
): Promise<void> {
  await runClientlessPluginEntry(port, id, origin, (record, activation, capabilities) =>
    invokeDefaultMenuAction(record.declaration, activation, action, selection, capabilities));
}
