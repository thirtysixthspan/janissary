// Session-scoped plugin state: which declarations were accepted, which modules have been loaded, and
// which plugins have been disabled. Load is individually guarded, so a throw, a failed chunk fetch, or
// a budget overrun disables that one plugin and leaves the picker stack and every other plugin
// running — the same containment the editor host and the tab-plugin host both provide.
//
// Registration is what activation means for this family. Nothing here loads a plugin: a declaration is
// enough for the host to answer "which chord opens this, which command word does, and what should
// happen when one does", which is the whole reason to declare statically. The chunk arrives when the
// user actually opens the overlay, and the plugin registers itself into the shared seam then.

import { errorFirstLine } from '@shared/error-text';
import { guardPluginCall } from '@shared/plugins/guard';
import type { OverlayPluginGrants, OverlayPluginLoader, OverlayPluginModule } from './api';
import { claimedByCore, overlayChordId } from './chords';
import { overlayPluginDeclarations, overlayPluginLoaders, validateDeclarations } from './registry';
import { closeContributedOverlay, registerContributedOverlay } from '../shared/contributed-overlays';

const LOAD_TIMEOUT_MS = 1000;

export type OverlayPluginHost = {
  // The plugin a chord opens, or null. Only accepted, non-disabled plugins appear.
  pluginForChord: (chordId: string) => string | null;
  // The plugin a command word opens, or null.
  pluginForCommand: (command: string) => string | null;
  // The accepted plugins in declaration order, for the host to hand the seam and the window handler.
  accepted: () => string[];
  // Loads the plugin and registers its overlay. Returns false when the plugin is disabled, has no
  // loader, or failed — in every one of those cases the plugin has been disabled and the reason is
  // reported through `onDisabled`.
  activate: (plugin: string) => Promise<boolean>;
  disabled: () => readonly string[];
  dispose: () => void;
};
export type OverlayPluginHostOptions = {
  declarations?: typeof overlayPluginDeclarations;
  loaders?: Record<string, OverlayPluginLoader>;
  timeoutMs?: number;
};

// `onDisabled` fires once per plugin, the first time it is disabled. The host deliberately knows
// nothing about how a failure is reported — the hook wires that to the notifications path.
export function createOverlayPluginHost(
  onDisabled: (plugin: string, reason: string) => void,
  capabilities: OverlayPluginGrants,
  options: OverlayPluginHostOptions = {},
): OverlayPluginHost {
  const { accepted, rejections } = validateDeclarations(options.declarations ?? overlayPluginDeclarations);
  const loaders: Record<string, OverlayPluginLoader> = options.loaders ?? overlayPluginLoaders;
  const timeoutMs = options.timeoutMs ?? LOAD_TIMEOUT_MS;

  const disabledPlugins = new Map<string, string>();
  const modules = new Map<string, OverlayPluginModule>();
  const loading = new Map<string, Promise<OverlayPluginModule>>();
  const unregisters = new Map<string, () => void>();

  // Each plugin's own close, bound to its name. Handed to the plugin as a capability so choosing an
  // entry and pressing Escape both put the overlay away without the plugin importing the seam.
  const closeFor = (plugin: string) => () => { closeContributedOverlay(plugin); };

  const disposePlugin = (plugin: string): void => {
    unregisters.get(plugin)?.();
    unregisters.delete(plugin);
    try {
      modules.get(plugin)?.dispose();
    } catch {
      // A dispose that throws has already cost the plugin; the failure is not worth a second report.
    }
    modules.delete(plugin);
  };

  const disable = (plugin: string, reason: string): void => {
    if (disabledPlugins.has(plugin)) return;
    disabledPlugins.set(plugin, reason);
    disposePlugin(plugin);
    loading.delete(plugin);
    onDisabled(plugin, reason);
  };

  for (const rejection of rejections) disable(rejection.id, rejection.reason);

  const enabled = accepted;

  // A chord the window handler already owns could never open, so it is reported at construction rather
  // than left silently dead.
  for (const declaration of enabled) {
    if (claimedByCore(declaration.chord)) {
      disable(declaration.id, `chord "${overlayChordId(declaration.chord)}" is already used by the application`);
    }
  }

  // The declarations that survived construction, minus anything disabled since. Read at call time
  // rather than captured: a plugin disabled by a failed load must stop answering its chord and its
  // command word immediately, or the host would keep routing to a plugin it has already given up on.
  const live = () => accepted.filter((declaration) => !disabledPlugins.has(declaration.id));

  const load = async (plugin: string): Promise<OverlayPluginModule> => {
    const cached = modules.get(plugin);
    if (cached) return cached;
    const pending = loading.get(plugin) ?? (async () => {
      const loader = loaders[plugin];
      if (!loader) throw new Error('has no loader');
      const loaded = await guardPluginCall(() => loader(), timeoutMs);
      if (typeof loaded?.default?.start !== 'function') throw new Error('exports no overlay');
      modules.set(plugin, loaded.default);
      return loaded.default;
    })();
    loading.set(plugin, pending);
    return pending;
  };

  return {
    accepted: () => live().map((declaration) => declaration.id),
    disabled: () => [...disabledPlugins.keys()],
    pluginForChord: (chord) => live().find((entry) => overlayChordId(entry.chord) === chord)?.id ?? null,
    pluginForCommand: (command) => {
      const wanted = command.toLowerCase();
      return live().find((entry) => entry.command.toLowerCase() === wanted)?.id ?? null;
    },
    activate: async (plugin) => {
      if (disabledPlugins.has(plugin)) return false;
      if (unregisters.has(plugin)) return true;
      try {
        const loaded = await load(plugin);
        const declaration = enabled.find((entry) => entry.id === plugin);
        if (!declaration) throw new Error('has no declaration');
        // The plugin hands back what it wants published; the host stores the unsubscription so a
        // disable or a dispose takes the overlay off the seam before anything can open it again. The
        // claims come from the declaration, not from the plugin, so nothing but the host has to know
        // which chord and command word reach a plugin.
        unregisters.set(plugin, registerContributedOverlay(
          loaded.start({ ...capabilities, close: closeFor(plugin) }),
          { chords: [overlayChordId(declaration.chord)], command: declaration.command },
        ));
        return true;
      } catch (error) {
        disable(plugin, errorFirstLine(error));
        return false;
      }
    },
    dispose: () => {
      for (const plugin of modules.keys()) disposePlugin(plugin);
      disabledPlugins.clear();
    },
  };
}
