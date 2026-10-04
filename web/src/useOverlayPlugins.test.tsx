import { act, render as renderComponent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TabView } from '@shared/protocol';
import { useOverlayPlugins, type UseOverlayPluginsOptions } from './useOverlayPlugins';
import {
  contributedOverlayOnScreen, contributedOverlays, openContributedOverlay, openOverlayForCommand, overlayClaimedByCommand, registerContributedOverlay,
} from './shared/contributed-overlays';
import { captureCopiedText } from './shared/clipboard-captures';

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
    focusHarness: () => {},
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

  // The bug this pins: the clipboard plugin used to start on the popup's first open, so everything
  // copied before then was gone. Mounting the hook starts it, and nothing here opens anything first.
  it('records a copy made before the clipboard popup has ever been opened', async () => {
    render();
    await vi.waitFor(() => {
      expect(contributedOverlays().map((overlay) => overlay.name)).toContain('clipboard-history');
    });

    captureCopiedText('copied before any open');

    const overlay = contributedOverlays().find((entry) => entry.name === 'clipboard-history');
    const popup = renderComponent(<>{overlay?.render(null)}</>);
    teardown.push(popup.unmount);
    expect(popup.getByText('copied before any open')).toBeTruthy();
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

// What the hook wires into the host, rather than what the host does with it: the two callbacks the
// host would otherwise have to reach the rest of the app to call, and the seam that lets a feature open
// an overlay without importing the plugin layer.
describe('what useOverlayPlugins wires into the host', () => {
  // The shared `render` fixes its options, and each case here needs its own client to assert against
  // — and one of them needs to rerender with a different `currentTab` closure.
  function mount(overrides: Partial<UseOverlayPluginsOptions> = {}) {
    const view = renderHook(({ opts }: { opts: UseOverlayPluginsOptions }) => useOverlayPlugins(opts), {
      initialProps: { opts: options(15, overrides) },
    });
    teardown.push(view.unmount);
    return { ...view, rerenderWith: (next: Partial<UseOverlayPluginsOptions>) => {
      view.rerender({ opts: options(15, next) });
    } };
  }

  async function mountWithClipboard(overrides: Partial<UseOverlayPluginsOptions> = {}) {
    const view = mount(overrides);
    await vi.waitFor(() => {
      expect(contributedOverlays().map((overlay) => overlay.name)).toContain('clipboard-history');
    });
    return view;
  }

  function clipboardOverlay() {
    return contributedOverlays().find((entry) => entry.name === 'clipboard-history');
  }

  it('opens an overlay from the command word, through the seam the host installs', async () => {
    render();
    expect(overlayClaimedByCommand('clip')).toBe(true);

    expect(openOverlayForCommand('clip', null)).toBe(true);

    await vi.waitFor(() => { expect(contributedOverlayOnScreen()?.name).toBe('clipboard-history'); });
  });

  // The paste capability is built here rather than imported by the plugin, so the tab and the harness
  // focus are read through refs — a tab switch between opening the overlay and choosing an entry has
  // to paste into the tab the user is looking at now, and focus the PTY they pasted into.
  it('pastes a chosen entry into the harness tab that is exposed now', async () => {
    const client = stubClient();
    const focusHarness = vi.fn();
    const harnessTab = { kind: 'agent', label: 'agent', harness: { ptyId: 'pty-9' } } as unknown as TabView;
    await mountWithClipboard({ client, currentTab: () => harnessTab, focusHarness });
    captureCopiedText('copied into the terminal');

    act(() => { openContributedOverlay('clipboard-history', null); });
    act(() => { clipboardOverlay()?.onKey(new KeyboardEvent('keydown', { key: 'Enter' })); });

    expect(vi.mocked(client.send)).toHaveBeenCalledWith({
      method: 'ptyInput', params: { id: 'pty-9', data: 'copied into the terminal' },
    });
    expect(focusHarness).toHaveBeenCalledWith('pty-9');
  });

  // Read at paste time, so a value captured when the host was built would paste into the tab the user
  // was looking at when the window opened rather than the one in front of them.
  it('reads the exposed tab through a ref, so a later tab is the one pasted into', async () => {
    const client = stubClient();
    const other = { kind: 'agent', label: 'other', harness: { ptyId: 'pty-2' } } as unknown as TabView;
    const view = await mountWithClipboard({ client, currentTab: () => TAB });

    view.rerenderWith({ client, currentTab: () => other });
    captureCopiedText('after the switch');

    act(() => { openContributedOverlay('clipboard-history', null); });
    act(() => { clipboardOverlay()?.onKey(new KeyboardEvent('keydown', { key: 'Enter' })); });

    expect(vi.mocked(client.send)).toHaveBeenCalledWith({
      method: 'ptyInput', params: { id: 'pty-2', data: 'after the switch' },
    });
  });

  // An overlay plugin owns no tab, so it has no transcript to write a failure into. The one surface a
  // user actually watches is the notifications feed, which is what `notify` is.
  it('reports a plugin that could not be activated through the notifications feed', async () => {
    const client = stubClient();
    const view = mount({ client });

    await expect(view.result.current.activate('no-such-plugin')).resolves.toBe(false);

    expect(vi.mocked(client.send)).toHaveBeenCalledWith({
      method: 'command',
      params: { text: 'notify Overlay plugin "no-such-plugin" disabled: has no loader.' },
    });
  });
});
