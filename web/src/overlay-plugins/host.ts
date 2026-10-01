// Session-scoped plugin state: which declarations were accepted, which modules have been loaded, and
// which plugins have been disabled. Load is individually guarded, so a throw, a failed chunk fetch, or
// a budget overrun disables that one plugin and leaves the picker stack and every other plugin
// running — the same containment the editor host and the tab-plugin host both provide.
//
// Registration is what activation means for this family. Constructing the host loads no plugin: a
// declaration is enough for the host to answer "which chord opens this, which command word does, and
// what should happen when one does", which is the whole reason to declare statically. The chunk arrives
// when the user actually opens the overlay, and the plugin registers itself into the shared seam then —
// unless its declaration asks for `'startup'`, in which case `activateAtStartup` loads it once the
// window has mounted.

import { errorFirstLine } from '@shared/error-text';
import { guardPluginCall } from '@shared/plugins/guard';
import type {
  OverlayPluginCapabilities, OverlayPluginGrants, OverlayPluginLoader, OverlayPluginModule,
} from './api';
import { claimedByCore, declarationChords, overlayChordId } from './chords';
import { guardOverlay } from './guarded-overlay';
import { overlayPluginDeclarations, overlayPluginLoaders, validateDeclarations } from './registry';
import { closeContributedOverlay, declareOverlayClaims, registerContributedOverlay } from '../shared/contributed-overlays';

const LOAD_TIMEOUT_MS = 1000;

export type OverlayPluginHost = {
  // Loads the plugin and registers its overlay. Returns false when the plugin is disabled, has no
  // loader, or failed — in every one of those cases the plugin has been disabled and the reason is
  // reported through `onDisabled`.
  activate: (plugin: string) => Promise<boolean>;
  // Activates every accepted plugin whose declaration asks for `'startup'`, concurrently: each one is
  // independent, and each failure is contained and reported by `activate` like any other.
  activateAtStartup: () => Promise<void>;
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
  const claimWithdrawals = new Map<string, () => void>();
  const activating = new Map<string, Promise<boolean>>();

  // Each plugin's own close, bound to its name. Handed to the plugin as a capability so choosing an
  // entry and pressing Escape both put the overlay away without the plugin importing the seam.
  const closeFor = (plugin: string) => () => { closeContributedOverlay(plugin); };

  // `maxEntries` is a getter on the grants, because the configuration arrives after mount. Spreading
  // the grants would read it once, here, and hand a startup plugin the default for good.
  const capabilitiesFor = (plugin: string): OverlayPluginCapabilities => ({
    paste: capabilities.paste,
    get maxEntries() { return capabilities.maxEntries; },
    close: closeFor(plugin),
  });

  // Advanced by `dispose`. An attempt still loading when the host is disposed — a startup activation
  // under StrictMode's effect replay is the ordinary case — must not start a plugin nothing will dispose.
  let generation = 0;

  const withdrawClaims = (plugin: string): void => {
    claimWithdrawals.get(plugin)?.();
    claimWithdrawals.delete(plugin);
  };

  // How a plugin is reached, published before anything has loaded it. This is the half of the routing
  // that a chord or a command word needs before it can decide anything, and it is why a plugin is
  // reachable on its first use rather than only after something has already opened it once.
  const publishClaims = (plugin: string): void => {
    if (claimWithdrawals.has(plugin) || disabledPlugins.has(plugin)) return;
    const declaration = byId.get(plugin);
    if (!declaration) return;
    claimWithdrawals.set(plugin, declareOverlayClaims(plugin, {
      chords: declarationChords(declaration).map((chord) => overlayChordId(chord)), command: declaration.command,
    }));
  };

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
    // A plugin the host has given up on stops answering its chord and its command word in the same
    // breath, so nothing routes to a plugin that can no longer be opened.
    withdrawClaims(plugin);
    disposePlugin(plugin);
    // Both caches are dropped, not just the load: a plugin disabled while its chunk was still in flight
    // must not be resurrected by an attempt that is already running, and must not keep one queued.
    loading.delete(plugin);
    activating.delete(plugin);
    onDisabled(plugin, reason);
  };

  for (const rejection of rejections) disable(rejection.id, rejection.reason);

  const enabled = accepted;
  const byId = new Map(enabled.map((entry) => [entry.id, entry]));

  // A chord the window handler already owns could never open, so it is reported at construction rather
  // than left silently dead.
  for (const declaration of enabled) {
    const owned = declarationChords(declaration).find((chord) => claimedByCore(chord));
    if (owned) disable(declaration.id, `chord "${overlayChordId(owned)}" is already used by the application`);
  }

  // Last, so a plugin refused above never publishes a claim.
  for (const declaration of enabled) publishClaims(declaration.id);

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

  const host: OverlayPluginHost = {
    activate: (plugin) => {
      if (disabledPlugins.has(plugin)) return Promise.resolve(false);
      if (unregisters.has(plugin)) return Promise.resolve(true);
      // The whole attempt, not just the load, is what a second caller has to wait for. `unregisters` is
      // written after the `await` below, so two openers arriving before the chunk resolves would both miss
      // it and both call `start` — running a plugin's lifecycle hook twice and overwriting the first
      // unregistration in the map, which is how a subscription made in `start` leaks.
      const inFlight = activating.get(plugin);
      if (inFlight) return inFlight;
      const startedIn = generation;
      const attempt = (async () => {
        try {
          const loaded = await load(plugin);
          if (startedIn !== generation) return false;
          if (!byId.get(plugin)) throw new Error('has no declaration');
          // The plugin hands back what it wants published; the host stores the unsubscription so a
          // disable or a dispose takes the overlay off the seam before anything can open it again. The
          // claims are not passed here: they were published from the declaration at construction, which is
          // what let the chord that got us here find this plugin before it was loaded.
          const overlay = guardOverlay(loaded.start(capabilitiesFor(plugin)), (reason) => {
            closeContributedOverlay(plugin);
            disable(plugin, reason);
          });
          unregisters.set(plugin, registerContributedOverlay(overlay));
          return true;
        } catch (error) {
          disable(plugin, errorFirstLine(error));
          return false;
        }
      })();
      activating.set(plugin, attempt);
      return attempt;
    },
    activateAtStartup: async () => {
      const startup = enabled.filter((declaration) => declaration.activation === 'startup');
      await Promise.all(startup.map((declaration) => host.activate(declaration.id)));
    },
    dispose: () => {
      generation += 1;
      for (const plugin of modules.keys()) disposePlugin(plugin);
      // Each withdrawal deletes itself from the map, so the map is emptied rather than iterated.
      for (const withdraw of claimWithdrawals.values()) withdraw();
      claimWithdrawals.clear();
      // A settled attempt is not a pending one, so this only drops references; `disable` is what clears
      // the map entry that could otherwise let a plugin be re-activated after the host gave up on it.
      activating.clear();
      disabledPlugins.clear();
    },
  };
  return host;
}
