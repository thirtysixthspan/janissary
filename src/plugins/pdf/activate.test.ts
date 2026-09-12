import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  TabPluginRejection, type TabPluginPayload, type TabPluginServerCapabilities,
} from '../api.js';
import { openerForExtension } from '../../openers/index.js';
import { activate } from './activate.js';

function fakeCapabilities(options: {
  viewer?: string;
  openExternally?: (file: string, application?: string) => boolean;
} = {}) {
  const notes: string[] = [];
  const notifications: string[] = [];
  const opened: TabPluginPayload[] = [];
  const keys: string[] = [];
  const claimedOpens: string[] = [];
  const registered: string[] = [];
  const external = vi.fn(options.openExternally ?? (() => true));
  const capabilities: TabPluginServerCapabilities = {
    note: (text) => { notes.push(text); },
    notifyUser: (text) => { notifications.push(text); },
    openOrFocusTab: (key, factory) => {
      keys.push(key);
      opened.push(factory({
        registerFile: (file) => { registered.push(file); return `/open/ref-${registered.length}`; },
      }));
    },
    openClaimedFiles: (target) => { claimedOpens.push(target); },
    configuredViewer: () => options.viewer ?? '',
    openExternally: external,
    rejectRequest: (reason): never => { throw new TabPluginRejection(reason); },
    reportFailure: (reason): never => { throw new Error(String(reason)); },
  };
  return { capabilities, claimedOpens, external, keys, notes, notifications, opened, registered };
}

const tabPayload = {
  name: 'paper.pdf', path: '/docs/paper.pdf', size: '1.2 MB', url: '/open/ref-1',
};

describe('pdf opener registration', () => {
  it('claims .pdf case-insensitively through the generic adapter', () => {
    expect(openerForExtension('.pdf')?.name).toBe('pdf');
    expect(openerForExtension('.PDF')?.name).toBe('pdf');
    expect(openerForExtension('.zip')?.name).not.toBe('pdf');
  });
});

describe('pdf plugin opener', () => {
  it('opens one tab keyed on the path, registering exactly one file', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-pdf-'));
    const file = path.join(dir, 'paper.pdf');
    writeFileSync(file, Buffer.alloc(1500));
    const fixture = fakeCapabilities();

    activate().opener.inline(file, fixture.capabilities);

    expect(fixture.keys).toEqual([file]);
    expect(fixture.registered).toEqual([file]);
    expect(fixture.opened[0]).toMatchObject({
      title: 'paper.pdf',
      payload: { name: 'paper.pdf', path: file, size: '1.5 KB' },
    });
    expect((fixture.opened[0].payload as { url: string }).url).toMatch(/^\/open\//u);
  });

  // The host focuses rather than opening when the instance key is already taken, so the plugin's
  // whole contribution to de-duplication is keying every presentation on the same path.
  it('keys a reopen of the same path on that same path', () => {
    const fixture = fakeCapabilities();
    activate().opener.inline('/docs/paper.pdf', fixture.capabilities);
    activate().opener.inline('/docs/paper.pdf', fixture.capabilities);
    expect(fixture.keys).toEqual(['/docs/paper.pdf', '/docs/paper.pdf']);
  });

  it('reaches the same tab from the edit presentation rather than the text editor', () => {
    const fixture = fakeCapabilities();
    activate().opener.edit?.('/docs/paper.pdf', fixture.capabilities);
    expect(fixture.keys).toEqual(['/docs/paper.pdf']);
    expect(fixture.external).not.toHaveBeenCalled();
  });

  it('reports unknown size when the file disappears during opening', () => {
    const fixture = fakeCapabilities();
    activate().opener.inline('/no/such/file.pdf', fixture.capabilities);
    expect(fixture.opened[0].payload).toMatchObject({ size: 'unknown' });
  });
});

describe('pdf plugin external opening', () => {
  it('launches the configured application and confirms it by name', () => {
    const fixture = fakeCapabilities({ viewer: 'Preview' });
    activate().opener.external('/docs/paper.pdf', fixture.capabilities);
    expect(fixture.external).toHaveBeenCalledWith('/docs/paper.pdf', 'Preview');
    expect(fixture.notes).toEqual(['Opening paper.pdf in Preview…']);
  });

  it('uses the OS default when no application is configured', () => {
    const fixture = fakeCapabilities();
    activate().opener.external('/docs/paper.pdf', fixture.capabilities);
    expect(fixture.external).toHaveBeenCalledWith('/docs/paper.pdf');
    expect(fixture.notes[0]).toContain('your default PDF viewer');
  });

  it('reports the path when no external viewer launches', () => {
    const fixture = fakeCapabilities({ openExternally: () => false });
    activate().opener.external('/docs/paper.pdf', fixture.capabilities);
    expect(fixture.notes).toEqual(['No PDF viewer available. The file is at /docs/paper.pdf']);
  });
});

describe('pdf plugin command', () => {
  it('hands the whole argument to the host open pipeline, pinned to its own opener', () => {
    const fixture = fakeCapabilities();
    activate().command?.('~/docs/*.pdf', fixture.capabilities);
    expect(fixture.claimedOpens).toEqual(['~/docs/*.pdf']);
    expect(fixture.opened).toEqual([]);
  });

  it('rejects a bare command with usage instead of disabling the plugin', () => {
    const fixture = fakeCapabilities();
    expect(() => activate().command?.('', fixture.capabilities))
      .toThrow(new TabPluginRejection('Usage: pdf <path>'));
    expect(fixture.claimedOpens).toEqual([]);
  });
});

describe('pdf plugin intents', () => {
  it('writes one fixed feed line for each failure kind', () => {
    const lines = [
      ['password-protected', 'paper.pdf is password-protected'],
      ['unreadable', 'paper.pdf could not be read'],
      ['other', 'Could not display paper.pdf'],
    ];
    for (const [reason, line] of lines) {
      const fixture = fakeCapabilities();
      const result = activate().intent(
        { tab: 'pdf', intent: 'load-failed', payload: { reason }, tabPayload }, fixture.capabilities,
      );
      expect(result).toBeNull();
      expect(fixture.notifications).toEqual([line]);
    }
  });

  it('answers malformed and unknown intents with a rejection, not a plugin failure', () => {
    const fixture = fakeCapabilities();
    for (const [intent, payload, message] of [
      ['load-failed', { reason: 'corrupt' }, 'invalid load-failed payload'],
      ['load-failed', {}, 'invalid load-failed payload'],
      ['unknown', {}, 'unknown pdf intent "unknown"'],
    ] as const) {
      expect(() => activate().intent({ tab: 'pdf', intent, payload, tabPayload }, fixture.capabilities))
        .toThrow(new TabPluginRejection(message));
    }
    expect(fixture.notifications).toEqual([]);
  });

  // A bad tab payload is the host's own record rather than client input, so it means this plugin
  // produced something invalid — the one PDF case that should genuinely disable the plugin.
  it('treats an invalid tab payload as a plugin failure rather than a rejection', () => {
    const fixture = fakeCapabilities();
    let thrown: unknown;
    try {
      activate().intent(
        { tab: 'pdf', intent: 'load-failed', payload: { reason: 'other' }, tabPayload: { nope: true } },
        fixture.capabilities,
      );
    } catch (error) { thrown = error; }
    expect(thrown).not.toBeInstanceOf(TabPluginRejection);
    expect((thrown as Error).message).toBe('invalid pdf tab payload');
  });
});
