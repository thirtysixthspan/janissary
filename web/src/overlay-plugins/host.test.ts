import { afterEach, describe, expect, it, vi } from 'vitest';
import { OVERLAY_PLUGIN_API_VERSION, type OverlayPluginDeclaration, type OverlayPluginModule } from './api';
import { overlayChordId } from './chords';
import { createOverlayPluginHost, type OverlayPluginHostOptions } from './host';
import {
  closeContributedOverlay, contributedOverlayOnScreen, installOverlayOpener, openContributedOverlay,
  openOverlayForChord, openOverlayForCommand, overlayClaimedByCommand,
} from '../shared/contributed-overlays';

const GRANTS = { paste: vi.fn(), maxEntries: 15 };

// The seam is module state shared across the file, so a host built in one test would answer chords in
// the next. Each test's teardown disposes its host, which withdraws its claims.
const teardown: (() => void)[] = [];
afterEach(() => { while (teardown.length > 0) teardown.pop()?.(); });

function declaration(overrides: Partial<OverlayPluginDeclaration> = {}): OverlayPluginDeclaration {
  return {
    id: 'fixture',
    version: '1.0.0',
    apiVersion: OVERLAY_PLUGIN_API_VERSION,
    chord: { key: 'v', ctrl: true, shift: true },
    command: 'clip',
    title: 'overlay',
    emptyText: '(nothing)',
    ...overrides,
  };
}

function overlayModule(overrides: Partial<OverlayPluginModule> = {}): OverlayPluginModule {
  return {
    start: () => ({
      name: 'fixture',
      claimsCommandBar: true,
      render: () => null,
      onKey: () => {},
      onOpen: () => {},
    }),
    dispose: () => {},
    ...overrides,
  };
}

function hostWith(
  onDisabled: (plugin: string, reason: string) => void,
  options: OverlayPluginHostOptions,
) {
  const host = createOverlayPluginHost(onDisabled, GRANTS, options);
  teardown.push(host.dispose);
  return host;
}

function noopReporter() {
  return vi.fn();
}

// Stands in for the real opener the app installs, so a test can drive the order a user drives: a chord
// reaches the seam, the seam hands the plugin's name to the opener, and the opener activates and opens.
function installActivatingOpener(host: { activate: (name: string) => Promise<boolean> }) {
  const opened: string[] = [];
  const uninstall = installOverlayOpener((name) => {
    opened.push(name);
    void host.activate(name).then((ready) => { if (ready) openContributedOverlay(name, null); });
  });
  teardown.push(uninstall);
  return opened;
}

describe('the overlay-plugin host', () => {
  it('routes a declared chord and command word without loading anything', () => {
    const load = vi.fn(async () => ({ default: overlayModule() }));
    hostWith(noopReporter(), {
      declarations: [declaration()] as never, loaders: { fixture: load },
    });

    expect(overlayClaimedByCommand('clip')).toBe(true);
    // Reading the declaration table is the whole of what a declaration is for, and it must not fetch.
    expect(load).not.toHaveBeenCalled();
  });

  // The order that is broken when routing reads registrations instead of declarations: a user pressing
  // the chord before the plugin has ever been opened must reach the plugin and get the overlay, not a
  // silently swallowed keystroke.
  it('reaches a plugin on the first chord and the first command word, with no prior activation', async () => {
    const load = vi.fn(async () => ({ default: overlayModule() }));
    const host = hostWith(noopReporter(), {
      declarations: [declaration()] as never, loaders: { fixture: load },
    });
    const opened = installActivatingOpener(host);

    expect(openOverlayForChord(overlayChordId({ key: 'v', ctrl: true, shift: true }))).toBe(true);
    expect(openOverlayForCommand('clip', null)).toBe(true);
    await vi.waitFor(() => { expect(contributedOverlayOnScreen()?.name).toBe('fixture'); });

    expect(opened).toEqual(['fixture', 'fixture']);
    // One chunk load however many times it was reached, since the second request finds it registered.
    expect(load).toHaveBeenCalledTimes(1);
  });

  // Two openers arriving before the chunk resolves — a user mashing the chord, or a chord and the
  // context menu in the same moment — used to both miss the `unregisters` guard, because it is written
  // after the load's `await`. Both then ran `start`, and the second registration overwrote the first
  // unregistration in the map, leaving nothing able to take the first one away.
  it('runs start once when two activations arrive before the chunk resolves', async () => {
    const start = vi.fn(() => ({
      name: 'fixture', claimsCommandBar: true, render: () => null, onKey: () => {}, onOpen: () => {},
    }));
    const load = vi.fn(async () => ({ default: overlayModule({ start }) }));
    const host = hostWith(noopReporter(), {
      declarations: [declaration()] as never,
      // A tick before the chunk arrives, so the plugin is genuinely still loading when the second
      // activation lands — which is the whole condition under test, and the one a chord fetch creates.
      loaders: { fixture: async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); return load(); } },
    });

    const first = host.activate('fixture');
    const second = host.activate('fixture');
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(start).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
    // A join reports the first attempt's outcome rather than a second, possibly different, one.
    expect(firstResult).toBe(true);
    expect(secondResult).toBe(true);
    // And the overlay is registered once, so exactly one open closes it.
    expect(contributedOverlayOnScreen()).toBeUndefined();
    openContributedOverlay('fixture', null);
    expect(contributedOverlayOnScreen()?.name).toBe('fixture');
    closeContributedOverlay('fixture');
    expect(contributedOverlayOnScreen()).toBeUndefined();
  });

  it('reports one attempt to both callers when the chunk fails', async () => {
    const onDisabled = noopReporter();
    const host = hostWith(onDisabled, {
      declarations: [declaration()] as never,
      loaders: { fixture: async () => { throw new Error('chunk is gone'); } },
    });

    const [first, second] = await Promise.all([host.activate('fixture'), host.activate('fixture')]);

    expect([first, second]).toEqual([false, false]);
    // One disable, one report: the join must not re-report the same failure.
    expect(onDisabled).toHaveBeenCalledTimes(1);
  });

  it('publishes the overlay a plugin returns, and opens it on request', async () => {
    const host = hostWith(noopReporter(), {
      declarations: [declaration()] as never,
      loaders: { fixture: async () => ({ default: overlayModule() }) },
    });

    expect(await host.activate('fixture')).toBe(true);
    openContributedOverlay('fixture', null);
    expect(contributedOverlayOnScreen()?.name).toBe('fixture');
    closeContributedOverlay('fixture');
  });

  it('disables a plugin whose module throws on load, and leaves the host running', async () => {
    const onDisabled = noopReporter();
    const host = hostWith(onDisabled, {
      declarations: [
        declaration({ id: 'broken' }),
        // A different chord and command word, so the healthy plugin is refused for nothing but the
        // broken one being broken.
        declaration({ id: 'healthy', chord: { key: 'b', ctrl: true }, command: 'other' }),
      ] as never,
      loaders: {
        broken: async () => { throw new Error('chunk is gone'); },
        healthy: async () => ({ default: overlayModule() }),
      },
    });

    expect(await host.activate('broken')).toBe(false);
    expect(onDisabled).toHaveBeenCalledWith('broken', 'chunk is gone');
    // A plugin the host has given up on must stop answering its chord and its command word in the same
    // breath, or a stale claim routes to something that can no longer be opened.
    expect(overlayClaimedByCommand('clip')).toBe(false);
    expect(overlayClaimedByCommand('other')).toBe(true);
    expect(await host.activate('healthy')).toBe(true);
  });

  it('disables a plugin whose module exports no overlay', async () => {
    const onDisabled = noopReporter();
    const host = hostWith(onDisabled, {
      declarations: [declaration()] as never,
      loaders: { fixture: async () => ({ default: {} as never }) },
    });

    expect(await host.activate('fixture')).toBe(false);
    expect(onDisabled).toHaveBeenCalledWith('fixture', 'exports no overlay');
    expect(overlayClaimedByCommand('clip')).toBe(false);
  });

  it('disables a plugin that claims a chord the application already uses', () => {
    const onDisabled = noopReporter();
    hostWith(onDisabled, {
      declarations: [declaration({ chord: { key: 'r', ctrl: true } })] as never,
      loaders: { fixture: async () => ({ default: overlayModule() }) },
    });

    expect(onDisabled).toHaveBeenCalledWith('fixture', expect.stringContaining('already used'));
    // Refused at construction, so it never published a claim at all.
    expect(overlayClaimedByCommand('clip')).toBe(false);
  });

  it('disables a plugin whose declaration was refused, without loading it', () => {
    const onDisabled = noopReporter();
    const load = vi.fn(async () => ({ default: overlayModule() }));
    hostWith(onDisabled, {
      declarations: [declaration({ apiVersion: 99 })] as never, loaders: { fixture: load },
    });

    expect(load).not.toHaveBeenCalled();
    expect(overlayClaimedByCommand('clip')).toBe(false);
  });

  it('withdraws its claims on dispose, so a disposed host answers nothing', () => {
    const host = hostWith(noopReporter(), {
      declarations: [declaration()] as never,
      loaders: { fixture: async () => ({ default: overlayModule() }) },
    });
    expect(overlayClaimedByCommand('clip')).toBe(true);

    host.dispose();

    expect(overlayClaimedByCommand('clip')).toBe(false);
  });

  it('gives a plugin its close bound to its own name, and takes the overlay away on dispose', async () => {
    const closes: (() => void)[] = [];
    const host = hostWith(noopReporter(), {
      declarations: [declaration()] as never,
      loaders: {
        fixture: async () => ({
          default: overlayModule({
            start: (grants) => {
              closes.push(grants.close);
              return {
                name: 'fixture', claimsCommandBar: true, render: () => null, onKey: () => {}, onOpen: () => {},
              };
            },
          }),
        }),
      },
    });

    await host.activate('fixture');
    openContributedOverlay('fixture', null);
    closes[0]?.();
    expect(contributedOverlayOnScreen()).toBeUndefined();

    await host.activate('fixture');
    openContributedOverlay('fixture', null);
    host.dispose();
    // Disposing takes the overlay off the seam, so nothing can open a plugin that is gone.
    expect(contributedOverlayOnScreen()).toBeUndefined();
  });

  it('survives a dispose that throws', async () => {
    const host = hostWith(noopReporter(), {
      declarations: [declaration()] as never,
      loaders: {
        fixture: async () => ({ default: overlayModule({ dispose: () => { throw new Error('bad teardown'); } }) }),
      },
    });

    await host.activate('fixture');
    expect(() => { host.dispose(); }).not.toThrow();
  });
});

// A plugin that has to observe something from launch — the clipboard history above all — declares
// `'startup'`, and is started without any opener having asked for it.
describe('activation at startup', () => {
  it('starts a startup plugin and registers its overlay with no opener involved', async () => {
    const start = vi.fn(() => ({
      name: 'fixture', claimsCommandBar: true, render: () => null, onKey: () => {}, onOpen: () => {},
    }));
    const opened = installOverlayOpener(() => { throw new Error('no opener should be reached'); });
    teardown.push(opened);
    const host = hostWith(noopReporter(), {
      declarations: [declaration({ activation: 'startup' })] as never,
      loaders: { fixture: async () => ({ default: overlayModule({ start }) }) },
    });

    await host.activateAtStartup();

    expect(start).toHaveBeenCalledTimes(1);
    // Registered but not opened: starting is not showing.
    expect(contributedOverlayOnScreen()).toBeUndefined();
    openContributedOverlay('fixture', null);
    expect(contributedOverlayOnScreen()?.name).toBe('fixture');
    closeContributedOverlay('fixture');
  });

  it('leaves a plugin that activates on open, or names no activation, unloaded', async () => {
    const onOpen = vi.fn(async () => ({ default: overlayModule() }));
    const unnamed = vi.fn(async () => ({ default: overlayModule() }));
    const host = hostWith(noopReporter(), {
      declarations: [
        declaration({ activation: 'open' }),
        declaration({ id: 'unnamed', chord: { key: 'b', ctrl: true }, command: 'other' }),
      ] as never,
      loaders: { fixture: onOpen, unnamed },
    });

    await host.activateAtStartup();

    expect(onOpen).not.toHaveBeenCalled();
    expect(unnamed).not.toHaveBeenCalled();
  });

  it('disables and reports a startup plugin that fails to load, like any other activation', async () => {
    const onDisabled = noopReporter();
    const host = hostWith(onDisabled, {
      declarations: [declaration({ activation: 'startup' })] as never,
      loaders: { fixture: async () => { throw new Error('chunk is gone'); } },
    });

    await expect(host.activateAtStartup()).resolves.toBeUndefined();

    expect(onDisabled).toHaveBeenCalledWith('fixture', 'chunk is gone');
    expect(overlayClaimedByCommand('clip')).toBe(false);
  });

  // The configured cap reaches the client after mount, so a plugin started at mount would keep the
  // default for good if the host handed it a copy of the number rather than a way to read it.
  it('hands a plugin the current cap, not the one it had when the plugin started', async () => {
    let configured = 15;
    const grants = { paste: vi.fn(), get maxEntries() { return configured; } };
    const seen: { maxEntries: number }[] = [];
    const host = createOverlayPluginHost(noopReporter(), grants, {
      declarations: [declaration({ activation: 'startup' })] as never,
      loaders: {
        fixture: async () => ({
          default: overlayModule({
            start: (capabilities) => {
              seen.push(capabilities);
              return { name: 'fixture', claimsCommandBar: true, render: () => null, onKey: () => {}, onOpen: () => {} };
            },
          }),
        }),
      },
    });
    teardown.push(host.dispose);

    await host.activateAtStartup();
    configured = 40;

    expect(seen[0]?.maxEntries).toBe(40);
  });

  // StrictMode runs the app shell's effects, cleans them up, and runs them again on the same host, so a
  // startup activation from the first run is still loading when the host is disposed.
  it('does not start a plugin whose load finishes after the host was disposed', async () => {
    const start = vi.fn(() => ({
      name: 'fixture', claimsCommandBar: true, render: () => null, onKey: () => {}, onOpen: () => {},
    }));
    let release!: () => void;
    // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- the web target excludes ES2024.
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const onDisabled = noopReporter();
    const host = hostWith(onDisabled, {
      declarations: [declaration({ activation: 'startup' })] as never,
      loaders: { fixture: async () => { await gate; return { default: overlayModule({ start }) }; } },
    });

    const pending = host.activate('fixture');
    host.dispose();
    release();

    expect(await pending).toBe(false);
    expect(start).not.toHaveBeenCalled();
    // A dispose is not a failure, so nothing is reported.
    expect(onDisabled).not.toHaveBeenCalled();
  });
});
