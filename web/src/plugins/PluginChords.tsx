import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';

// A chord a plugin tab claims while it is the visible one. The handler runs instead of the
// application's action; it returns nothing, because a chord handler's only job is to have run.
//
// Registered by the mounted body while the host reports that tab visible, and released the moment it
// does not. That is the whole of the precedence rule: a claim exists exactly while the tab the user is
// looking at is on screen, so focusing anything else hands the chord straight back to the application
// without anything having to be undone.
export type PluginChordHandler = () => void;

// Keyed by plugin id and chord together, so two plugins claiming the same chord cannot overwrite each
// other, and releasing one is releasing only its own claim.
export type PluginChordRegistry = {
  register(pluginId: string, chordId: string, handler: PluginChordHandler): () => void;
  run(chordId: string): boolean;
};

export function createPluginChordRegistry(): PluginChordRegistry {
  const claims = new Map<string, PluginChordHandler>();
  return {
    register: (pluginId, chordId, handler) => {
      const key = `${pluginId} ${chordId}`;
      claims.set(key, handler);
      return () => { claims.delete(key); };
    },
    // No claim registered means the application keeps the chord, which is what makes a declaration that
    // claims one nothing ever answers for harmless rather than a swallowed key.
    run: (chordId) => {
      for (const [key, handler] of claims) {
        if (!key.endsWith(` ${chordId}`)) continue;
        handler();
        return true;
      }
      return false;
    },
  };
}

const PluginChordContext = createContext<PluginChordRegistry | null>(null);

export function PluginChordProvider({ registry, children }: {
  registry: PluginChordRegistry;
  children: ReactNode;
}) {
  return <PluginChordContext.Provider value={registry}>{children}</PluginChordContext.Provider>;
}

// Throws rather than answering "no chord claimed": a missing provider is a wiring mistake, and
// answering quietly would make every claimed chord silently inert.
export function usePluginChords(): PluginChordRegistry {
  const registry = useContext(PluginChordContext);
  if (registry === null) throw new Error('no PluginChordProvider above this plugin');
  return registry;
}

// Holds every chord this plugin claims for as long as one of its tabs is the visible one. The handler
// goes through a ref so that changing what the handler does does not re-register the claim — which
// would drop and retake the chord in the same tick, and a key pressed inside that window would fall
// through to the application.
//
// The claim list is keyed by its joined form, and read through a ref, for the same reason. It arrives
// on the tab's wire view, which the host rebuilds on every state broadcast, so depending on the
// array's identity would release and retake the claim continuously and open exactly that window to
// ordinary use.
export function usePluginChordClaims(
  pluginId: string,
  chords: readonly string[],
  active: boolean,
  handler: PluginChordHandler,
): void {
  const registry = usePluginChords();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const chordsRef = useRef(chords);
  chordsRef.current = chords;
  const claimed = chords.join(' ');
  useEffect(() => {
    const ids = chordsRef.current;
    if (!active || ids.length === 0) return;
    const releases = ids.map((chordId) =>
      registry.register(pluginId, chordId, () => { handlerRef.current(); }));
    return () => { for (const release of releases) release(); };
  }, [registry, pluginId, active, claimed]);
}