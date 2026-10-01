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
