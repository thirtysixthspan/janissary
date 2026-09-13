import type { Managers } from '../managers.js';
import { defaultMenuActionFor } from '../plugins/default-menu.js';
import type { DefaultMenuEntry } from '../protocol.js';

// The generic tab-plugin RPCs, plus the default context menu's pair. Kept apart from the editor
// adapter they briefly shared a home with: these route to whichever bundled plugin owns the named
// tab and have nothing to do with the editor, so filing them under it would make the adapter a
// grab bag rather than one subsystem's surface. Plugin identity resolves server-side from the
// host's own records — the default menu has no owner tree, so resolution either answers exactly
// one contribution or none.
export type PluginControllerAdapter = {
  defaultMenuSelectionAction(): DefaultMenuEntry | null;
  runDefaultMenuSelectionAction(selection: string, action: string): void;
  pluginIntent(tab: string, intent: string, payload: unknown): Promise<unknown>;
  pluginFailed(tab: string, reason: string): void;
};

// Where a default-menu failure is noted: the active tab, whichever it is — the menu is a shell-level
// surface and does not belong to the tab it landed on.
function originOf(managers: Managers): { label: string; command: string } {
  return {
    label: managers.tab.tabs[managers.tab.activeTab]?.label ?? 'janus',
    command: 'default menu',
  };
}

export function createPluginControllerAdapter(managers: Managers): PluginControllerAdapter {
  return {
    defaultMenuSelectionAction: () => {
      const match = defaultMenuActionFor(managers.plugins.declarations);
      return match ? { label: match.label } : null;
    },
    runDefaultMenuSelectionAction: (selection, action) => {
      const match = defaultMenuActionFor(managers.plugins.declarations);
      if (!match || match.label !== action) return;
      void managers.plugins.runDefaultMenuAction(match.plugin, action, selection, originOf(managers));
    },
    pluginIntent: (tab, intent, payload) => managers.plugins.intent(tab, intent, payload),
    pluginFailed: (tab, reason) => managers.plugins.clientFailed(tab, reason),
  };
}
