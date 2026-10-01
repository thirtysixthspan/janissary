import { describe, expect, it, vi } from 'vitest';
import { OVERLAY_PLUGIN_API_VERSION, type OverlayPluginDeclaration, type OverlayPluginModule } from './api';
import { overlayChordId } from './chords';
import { createOverlayPluginHost, type OverlayPluginHostOptions } from './host';
import {
  closeContributedOverlay, contributedOverlayOnScreen, openContributedOverlay,
} from '../shared/contributed-overlays';

const GRANTS = { paste: vi.fn(), maxEntries: 15 };

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
  return createOverlayPluginHost(onDisabled, GRANTS, options);
}

function noopReporter() {
  return vi.fn();
}

describe('the overlay-plugin host', () => {
  it('resolves a chord and a command word without loading anything', () => {
    const load = vi.fn(async () => ({ default: overlayModule() }));
    const host = hostWith(noopReporter(), {
      declarations: [declaration()] as never, loaders: { fixture: load },
    });

    expect(host.pluginForChord(overlayChordId({ key: 'v', ctrl: true, shift: true }))).toBe('fixture');
    expect(host.pluginForCommand('clip')).toBe('fixture');
    expect(host.pluginForCommand('CLIP')).toBe('fixture');
    // Reading the declaration table is the whole of what a declaration is for, and it must not fetch.
    expect(load).not.toHaveBeenCalled();
    host.dispose();
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
    host.dispose();
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
    expect(host.disabled()).toEqual(['broken']);
    expect(onDisabled).toHaveBeenCalledWith('broken', 'chunk is gone');
    expect(host.accepted()).toEqual(['healthy']);
    host.dispose();
  });

  it('disables a plugin whose module exports no overlay', async () => {
    const onDisabled = noopReporter();
    const host = hostWith(onDisabled, {
      declarations: [declaration()] as never,
      loaders: { fixture: async () => ({ default: {} as never }) },
    });

    expect(await host.activate('fixture')).toBe(false);
    expect(onDisabled).toHaveBeenCalledWith('fixture', 'exports no overlay');
    host.dispose();
  });

  it('disables a plugin that claims a chord the application already uses', () => {
    const onDisabled = noopReporter();
    const host = hostWith(onDisabled, {
      declarations: [declaration({ chord: { key: 'r', ctrl: true } })] as never,
      loaders: { fixture: async () => ({ default: overlayModule() }) },
    });

    expect(onDisabled).toHaveBeenCalledWith('fixture', expect.stringContaining('already used'));
    expect(host.accepted()).toEqual([]);
    host.dispose();
  });

  it('disables a plugin whose declaration was refused, without loading it', () => {
    const onDisabled = noopReporter();
    const load = vi.fn(async () => ({ default: overlayModule() }));
    const host = hostWith(onDisabled, {
      declarations: [declaration({ apiVersion: 99 })] as never, loaders: { fixture: load },
    });

    expect(host.disabled()).toEqual(['fixture']);
    expect(load).not.toHaveBeenCalled();
    host.dispose();
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
