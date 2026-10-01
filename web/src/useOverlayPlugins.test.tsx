import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TabView } from '@shared/protocol';
import { useOverlayPlugins, type UseOverlayPluginsOptions } from './useOverlayPlugins';
import { contributedOverlayOnScreen, openContributedOverlay, overlayClaimedByCommand, registerContributedOverlay } from './shared/contributed-overlays';

// The hook that owns the overlay-plugin host's lifetime. Every other host test constructs a host
// directly, so nothing until this file mounted the hook — and the bug this file exists for is in the
// hook's memo lifecycle, not in the host.
//
// The shape of the failure: a `useMemo` that depends on a caller-supplied closure sees a new identity
// on every render, so it builds a new host every render, and the effect that disposes the old one fires
// each time. A disposed host takes its plugins off the seam and runs their `dispose`, which for the
// clipboard history means clearing every recorded entry and dropping the copy subscription.

const TAB = { kind: 'agent', label: 'agent' } as unknown as TabView;

const teardown: (() => void)[] = [];
afterEach(() => { while (teardown.length > 0) teardown.pop()?.(); });

function stubClient() {
  return { send: vi.fn() } as unknown as UseOverlayPluginsOptions['client'];
}

// The client and the drop ref are stable for the life of a session in the app shell, and the hook is
// entitled to depend on them. Only `currentTab` changes identity from render to render, because the app
// shell passed an inline arrow — so only that one may vary below, or this file would be testing a
// different bug from the one it exists for.
const CLIENT = stubClient();
const DROP_REF: UseOverlayPluginsOptions['dropRef'] = { current: null };

function options(maxEntries: number, overrides: Partial<UseOverlayPluginsOptions> = {}): UseOverlayPluginsOptions {
  return {
    client: CLIENT,
    dropRef: DROP_REF,
    maxEntries,
    currentTab: () => TAB,
    tabLabel: TAB.label,
    ...overrides,
  };
}

function render(maxEntries = 15) {
  const view = renderHook(({ opts }: { opts: UseOverlayPluginsOptions }) => useOverlayPlugins(opts), {
    initialProps: { opts: options(maxEntries) },
  });
  teardown.push(view.unmount);
  return {
    ...view,
    rerenderWithNewClosures: () => { view.rerender({ opts: options(maxEntries) }); },
    rerenderWith: (next: Partial<UseOverlayPluginsOptions>) => {
      view.rerender({ opts: options(maxEntries, next) });
    },
  };
}

describe('useOverlayPlugins', () => {
  it('keeps one host across rerenders, even when every option is a new object', () => {
    const view = render();
    const first = view.result.current;

    view.rerenderWithNewClosures();
    view.rerenderWithNewClosures();

    // A host rebuilt here would dispose the previous one, and with it everything the plugins hold.
    expect(view.result.current).toBe(first);
  });

  it('leaves a plugin registered on the seam across a rerender', () => {
    const view = render();
    registerContributedOverlay({
      name: 'clipboard-history', claimsCommandBar: true, render: () => null, onKey: () => {}, onOpen: () => {},
    });
    act(() => { openContributedOverlay('clipboard-history', null); });

    view.rerenderWithNewClosures();

    // The user-visible half: a disposed host took the overlay away with it.
    expect(contributedOverlayOnScreen()?.name).toBe('clipboard-history');
  });

  it('closes an open overlay when the exposed tab changes', () => {
    const view = render();
    teardown.push(registerContributedOverlay({
      name: 'clipboard-history', claimsCommandBar: true, render: () => null, onKey: () => {}, onOpen: () => {},
    }));
    act(() => { openContributedOverlay('clipboard-history', null); });

    view.rerenderWith({ tabLabel: TAB.label });
    expect(contributedOverlayOnScreen()?.name).toBe('clipboard-history');

    view.rerenderWith({ tabLabel: 'another-tab' });
    expect(contributedOverlayOnScreen()).toBeUndefined();
  });

  it('reads the cap through a ref, so a later value reaches the same host', () => {
    const view = render(5);
    const first = view.result.current;

    view.rerenderWith({ maxEntries: 3 });

    // Same host, new cap: the config arrives after mount, so the number cannot be captured at build time.
    expect(view.result.current).toBe(first);
  });

  it('disposes the host on unmount, so its claims stop answering', () => {
    const view = render();
    // The real registry declares `clipboard-history` on `clip`, so the hook's host has published a claim
    // for it by the time the hook has mounted.
    expect(overlayClaimedByCommand('clip')).toBe(true);

    view.unmount();

    expect(overlayClaimedByCommand('clip')).toBe(false);
  });
});
