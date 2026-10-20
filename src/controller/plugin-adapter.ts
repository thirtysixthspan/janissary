import type { Managers } from '../managers.js';
import { defaultMenuActionsFor } from '../plugins/default-menu.js';
import type { DefaultMenuEntry } from '../protocol.js';

// The generic tab-plugin RPCs, plus the default context menu's pair. Kept apart from the editor
// adapter they briefly shared a home with: these route to whichever bundled plugin owns the named
// tab and have nothing to do with the editor, so filing them under it would make the adapter a
// grab bag rather than one subsystem's surface. Plugin identity resolves server-side from the
// host's own records — the default menu has no owner tree, so an entry's label is what names it.
export type PluginControllerAdapter = {
  defaultMenuSelectionAction(): DefaultMenuEntry[];
  runDefaultMenuSelectionAction(selection: string, action: string, tab?: string): void;
  pluginIntent(tab: string, intent: string, payload: unknown): Promise<unknown>;
  pluginFailed(tab: string, reason: string): void;
};

// The tab a default-menu action came from: the open tab the client named, else the active tab — an
// older client sends no tab, and an unknown label still leaves the action itself valid.
function originOf(managers: Managers, tab?: string): { label: string; command: string } {
  const named = tab ? managers.tab.byLabel(tab) : undefined;
  return {
    label: named?.label ?? managers.tab.tabs[managers.tab.activeTab]?.label ?? 'janus',
    command: 'default menu',
  };
}

export function createPluginControllerAdapter(managers: Managers): PluginControllerAdapter {
  const eligibleActions = () => defaultMenuActionsFor(managers.plugins.declarations.filter((declaration) => {
    const state = managers.plugins.statusFor(declaration.id)?.state;
    return state === 'declared' || state === 'active';
  }));
  return {
    defaultMenuSelectionAction: () => eligibleActions().map(({ label, shortcut }) => ({
      label, ...(shortcut && { shortcut }),
    })),
    runDefaultMenuSelectionAction: (selection, action, tab) => {
      const match = eligibleActions().find((entry) => entry.label === action);
      if (!match) return;
      void managers.plugins.runDefaultMenuAction(match.plugin, action, selection, originOf(managers, tab));
    },
    pluginIntent: (tab, intent, payload) => managers.plugins.intent(tab, intent, payload),
    pluginFailed: (tab, reason) => managers.plugins.clientFailed(tab, reason),
  };
}
