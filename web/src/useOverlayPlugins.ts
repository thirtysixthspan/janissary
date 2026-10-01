import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import type { CommandInputDropHandle } from './shared/drop-handles';
import type { OverlayPluginHost } from './overlay-plugins/host';
import { createOverlayPluginHost } from './overlay-plugins/host';
import {
  closeContributedOverlays, contributedOverlaysVersion, installOverlayOpener, openContributedOverlay, subscribeContributedOverlays,
} from './shared/contributed-overlays';
import { createPasteCapability } from './paste-into-surface';

// The overlay-plugin host, built once per session and disposed with the window.
//
// The paste capability is constructed here rather than imported by the plugin because the plugin
// boundary forbids reaching the command bar, the editor's drop registry, or the tab view, and because
// a service belongs at the edge rather than inside a component
// (`ai/guidelines/react-code-organization.md` §7).
//
// A plugin's chunk loads when its chord, its command word, or the context menu first asks for it,
// which is the whole point of declaring statically. The one exception is a plugin whose declaration
// asks for `'startup'`: the effect below activates it once the window has mounted.
//
// `maxEntries` is read through a getter rather than captured, because the value arrives in the first
// state snapshot — after mount, and so after a startup plugin has already started. A plugin reads it
// when it needs it, and sees the configured number from the first snapshot on.
//
// `currentTab` is behind a ref for the same reason and one more: the host is session-scoped, so every
// value the memo below depends on has to be stable, and a caller's `() => currentTab` is a fresh
// identity on every render even though what it reads has not changed. Depend on it and the host is
// rebuilt — and the effect that disposes it runs — on ordinary shell re-renders, which is enough to
// throw away a plugin's history and drop its subscriptions. `focusHarness` is behind a ref for the
// same reason.
//
// `tabLabel` is the exposed tab's label, and a change to it closes any open overlay. An overlay is a
// modal over the tab it opened on, so it does not follow the user to another one. The label rather
// than the index is the key, because closing a tab to the left shifts the index without changing what
// is on screen.

export type UseOverlayPluginsOptions = {
  client: JanusClient;
  dropRef: React.RefObject<CommandInputDropHandle | null>;
  maxEntries: number;
  currentTab: () => TabView | undefined;
  focusHarness: (ptyId: string) => void;
  tabLabel: string | undefined;
};

export function useOverlayPlugins(options: UseOverlayPluginsOptions): OverlayPluginHost {
  const { client, dropRef, maxEntries, currentTab, focusHarness, tabLabel } = options;

  const maxEntriesRef = useRef(maxEntries);
  maxEntriesRef.current = maxEntries;
  const currentTabRef = useRef(currentTab);
  currentTabRef.current = currentTab;
  const focusHarnessRef = useRef(focusHarness);
  focusHarnessRef.current = focusHarness;

  const onDisabled = useMemo(
    () => (plugin: string, reason: string) => {
      // The notifications feed is the one surface a user actually watches, and `notify` is the one
      // way the client can put something there. An overlay plugin owns no tab, so it has no
      // transcript to write into the way a tab plugin reports its own failure.
      client.send({
        method: 'command',
        params: { text: `notify Overlay plugin "${plugin}" disabled: ${reason}.` },
      });
    },
    [client],
  );

  const host = useMemo(
    () => createOverlayPluginHost(onDisabled, {
      paste: createPasteCapability({
        client, dropRef,
        currentTab: () => currentTabRef.current(),
        focusHarness: (ptyId) => { focusHarnessRef.current(ptyId); },
      }),
      get maxEntries() { return maxEntriesRef.current; },
    }),
    [client, dropRef, onDisabled],
  );

  // A contributed overlay opening or closing changes nothing in React state, so this is what puts it
  // back in the overlay registry's answer. The snapshot is a counter rather than a derived list so it
  // is stable between changes, which is what `useSyncExternalStore` needs.
  useSyncExternalStore(subscribeContributedOverlays, contributedOverlaysVersion, contributedOverlaysVersion);

  // The one way in from the outside: the seam resolves a chord or a command word to a plugin, and the
  // host loads its chunk and then opens it. This is what lets the command bar and the context menu
  // open an overlay while importing nothing from the plugin layer.
  useEffect(() => installOverlayOpener((plugin, anchor) => {
    void host.activate(plugin).then((ready) => { if (ready) openContributedOverlay(plugin, anchor); });
  }), [host]);

  useEffect(() => {
    void host.activateAtStartup();
    return () => { host.dispose(); };
  }, [host]);

  useEffect(() => { closeContributedOverlays(); }, [tabLabel]);

  return host;
}
