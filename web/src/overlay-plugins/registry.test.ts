import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OVERLAY_PLUGIN_API_VERSION, type OverlayPluginDeclaration } from './api';
import { claimedByCore, eventChordId, overlayChordId } from './chords';
import { overlayPluginDeclarations, overlayPluginLoaders, validateDeclarations } from './registry';

function declaration(overrides: Partial<OverlayPluginDeclaration> = {}): OverlayPluginDeclaration {
  return {
    id: 'fixture',
    version: '1.0.0',
    apiVersion: OVERLAY_PLUGIN_API_VERSION,
    chord: { key: 'v', ctrl: true, shift: true },
    command: 'clip',
    title: 'clipboard',
    emptyText: '(no clipboard history)',
    ...overrides,
  };
}

describe('the shipped registry', () => {
  it('declares a loader for every plugin and a plugin for every loader', () => {
    expect(Object.keys(overlayPluginLoaders).toSorted((a, b) => a.localeCompare(b)))
      .toEqual(overlayPluginDeclarations.map((entry) => entry.id).toSorted((a, b) => a.localeCompare(b)));
  });

  it('accepts every declaration it ships', () => {
    expect(validateDeclarations().rejections).toEqual([]);
  });

  // The registry is reachable from the entry bundle, so a static import of an implementation would
  // pull that plugin's chunk in with it and silently defeat the lazy loading the loaders exist for.
  it('reaches its implementation only through a dynamic import', () => {
    const source = readFileSync('web/src/overlay-plugins/registry.ts', 'utf8');
    const statics = [...source.matchAll(/^import\s[^;]*?from\s+'(?<path>[^']+)'/gmu)]
      .map((match) => match.groups?.path ?? '');
    expect(statics.filter((path) => path.includes('clipboard-history'))).toEqual([]);
    expect(source).toContain("() => import('./clipboard-history/index')");
  });
});

describe('validateDeclarations', () => {
  it('refuses a plugin claiming a chord another plugin already has', () => {
    const { accepted, rejections } = validateDeclarations([
      declaration({ id: 'first' }),
      declaration({ id: 'second' }),
    ]);
    expect(accepted.map((entry) => entry.id)).toEqual(['first']);
    expect(rejections).toHaveLength(1);
    expect(rejections[0].reason).toContain('already claimed by "first"');
  });

  it('refuses a command word another plugin already has', () => {
    const { rejections } = validateDeclarations([
      declaration({ id: 'first' }),
      declaration({ id: 'second', chord: { key: 'b', ctrl: true } }),
    ]);
    expect(rejections[0].reason).toContain('command "clip" is already claimed by "first"');
  });

  it('refuses a command word the built-in dispatcher already answers', () => {
    const { rejections } = validateDeclarations([declaration({ command: 'hist' })]);
    expect(rejections[0].reason).toContain('built-in');
  });

  it('refuses a plugin written against another version of the contract', () => {
    const { rejections } = validateDeclarations([declaration({ apiVersion: 99 })]);
    expect(rejections[0].reason).toContain('requires overlay plugin API 99');
  });

  // One bad declaration must cost that plugin and nothing else — the host has to start with every
  // plugin broken — so a rejection is data rather than a throw.
  it('records a refusal instead of throwing, leaving the healthy plugins accepted', () => {
    const { accepted, rejections } = validateDeclarations([
      declaration({ id: 'broken', apiVersion: 99 }),
      declaration({ id: 'healthy' }),
    ]);
    expect(accepted.map((entry) => entry.id)).toEqual(['healthy']);
    expect(rejections.map((entry) => entry.id)).toEqual(['broken']);
  });
});

describe('claimedByCore', () => {
  it.each([
    ['Ctrl+R', { key: 'r', ctrl: true }],
    ['Ctrl+G', { key: 'g', ctrl: true }],
    ['Ctrl+E', { key: 'e', ctrl: true }],
    ['Ctrl+A', { key: 'a', ctrl: true }],
    ['Cmd+P', { key: 'p', meta: true }],
    ['Cmd+F', { key: 'f', meta: true }],
    ['Cmd+Shift+F', { key: 'f', meta: true, shift: true }],
    // Cmd+T opens a new agent tab. The list this replaced did not carry it, so a plugin could declare it,
    // be accepted, and then be shadowed by the window handler — the one failure the refusal exists for.
    ['Cmd+T', { key: 't', meta: true }],
    ['Shift+Tab', { key: 'Tab', shift: true }],
  ])('refuses %s, which the application owns', (_name, chord) => {
    expect(claimedByCore(chord)).toBe(true);
  });

  it('leaves Ctrl+Shift+V alone, which nothing else claims', () => {
    expect(claimedByCore({ key: 'v', ctrl: true, shift: true })).toBe(false);
    // And plain Ctrl+V stays the browser's own paste in an editor buffer, which is why the shift is
    // part of the claim rather than an afterthought.
    expect(claimedByCore({ key: 'v', ctrl: true })).toBe(false);
  });
});

describe('overlayChordId', () => {
  it('writes the same chord the same way however it is written', () => {
    expect(overlayChordId({ key: 'V', ctrl: true, shift: true }))
      .toBe(overlayChordId({ key: 'v', ctrl: true, shift: true }));
  });

  it('keeps a shifted chord distinct from the bare one', () => {
    expect(overlayChordId({ key: 'v', ctrl: true, shift: true }))
      .not.toBe(overlayChordId({ key: 'v', ctrl: true }));
  });

  // A `KeyboardEvent` carries `metaKey`/`ctrlKey`/`shiftKey`/`altKey`; a chord carries `meta`/`ctrl`/
  // `shift`/`alt`. Passing one where the other is expected type-checks, because every modifier is
  // optional, and silently reads all four as absent — which is how a claimed chord stops matching.
  it('reads a keydown as the chord it presses', () => {
    expect(eventChordId({ key: 'V', metaKey: false, ctrlKey: true, shiftKey: true, altKey: false }))
      .toBe('ctrl+shift+v');
    expect(eventChordId({ key: 'v', metaKey: false, ctrlKey: true, shiftKey: false, altKey: false }))
      .toBe('ctrl+v');
  });
});
