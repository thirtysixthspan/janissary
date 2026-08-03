import type { Managers } from '../managers.js';

// The two generic tab-plugin RPCs. Kept apart from the editor adapter they briefly shared a home
// with: these route to whichever bundled plugin owns the named tab and have nothing to do with the
// editor, so filing them under it would make the adapter a grab bag rather than one subsystem's
// surface. Both resolve plugin identity server-side from the host's own open-tab record.
export type PluginControllerAdapter = {
  pluginIntent(tab: string, intent: string, payload: unknown): Promise<unknown>;
  pluginFailed(tab: string, reason: string): void;
};

export function createPluginControllerAdapter(managers: Managers): PluginControllerAdapter {
  return {
    pluginIntent: (tab, intent, payload) => managers.plugins.intent(tab, intent, payload),
    pluginFailed: (tab, reason) => managers.plugins.clientFailed(tab, reason),
  };
}
