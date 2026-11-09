import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decodeCommandSettings } from './decode.js';
import { NativeCommandSettingsManager } from './manager.js';

const roots: string[] = [];
function fixture(): { root: string; home: string; manager: NativeCommandSettingsManager } {
  const base = mkdtempSync(path.join(os.tmpdir(), 'native-command-settings-'));
  roots.push(base);
  const root = path.join(base, 'project');
  const home = path.join(base, 'home');
  mkdirSync(root);
  mkdirSync(home);
  return { root, home, manager: new NativeCommandSettingsManager(root, home) };
}

function put(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function homeFile(home: string): string { return path.join(home, '.janissary', 'commands.json'); }
function projectFile(root: string): string { return path.join(root, '.janissary', 'commands.json'); }

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('native command settings', () => {
  it('returns enabled defaults without creating a file', () => {
    const { home, manager } = fixture();
    expect(manager.current().source).toBe('default');
    expect(manager.current().commands.every(({ enabled, agentAccess }) => enabled && agentAccess)).toBe(true);
    expect(existsSync(homeFile(home))).toBe(false);
  });

  it('normalizes keys in textual order and defaults omitted fields', () => {
    const decoded = decodeCommandSettings(
      { ' DB   SQLITE QUERY ': { enabled: false }, 'db sqlite query': { agentAccess: false } },
      '{ " DB   SQLITE QUERY ": { "enabled": false }, "db sqlite query": { "agentAccess": false } }',
    );
    expect(decoded?.values['db sqlite query']).toEqual({ enabled: true, agentAccess: false });
    expect(decoded?.malformed).toBe(false);
  });

  it('uses true defaults for malformed individual entries and removes them on a successful edit', async () => {
    const { root, home, manager } = fixture();
    const file = projectFile(root);
    const contents = '{"clear": false}';
    put(file, contents);
    manager.refresh();
    expect(manager.current().commands.find(({ name }) => name === 'clear')).toMatchObject({ enabled: true, agentAccess: true });
    expect(await manager.edit({ name: 'clear', setting: { enabled: false } })).toEqual({ ok: true });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveProperty('clear', { enabled: false, agentAccess: true });
    expect(existsSync(homeFile(home))).toBe(false);
  });

  it('falls back from an unreadable project JSON file to home without making home read-only', async () => {
    const { root, home, manager } = fixture();
    const broken = '{ bad';
    put(projectFile(root), broken);
    put(homeFile(home), '{"clear":{"enabled":false}}');
    manager.refresh();
    expect(manager.current()).toMatchObject({
      source: 'home', path: homeFile(home),
      problem: `commands.json is not valid JSON at ${projectFile(root)} — showing the home commands file.`,
    });
    expect(manager.current().commands.find(({ name }) => name === 'clear')?.enabled).toBe(false);
    expect(readFileSync(projectFile(root), 'utf8')).toBe(broken);
    expect(await manager.edit({ name: 'clear', setting: { enabled: true } })).toEqual({ ok: true });
    expect(readFileSync(projectFile(root), 'utf8')).toBe(broken);
    expect(JSON.parse(readFileSync(homeFile(home), 'utf8'))).toHaveProperty('clear.enabled', true);
  });

  it('falls back to defaults and names the bad file when both files are unusable', () => {
    const { root, home, manager } = fixture();
    put(projectFile(root), '[]');
    put(homeFile(home), 'not-json');
    manager.refresh();
    expect(manager.current()).toMatchObject({
      source: 'default', path: homeFile(home),
      problem: `commands.json is unusable at ${projectFile(root)} — showing default commands.`,
    });
  });

  it('writes the first edit to home, publishes only after success, and saves canonical known names', async () => {
    const { home, manager } = fixture();
    put(homeFile(home), '{"unknown command":{"enabled":false}}');
    const received: boolean[] = [];
    const unsubscribe = manager.subscribe((snapshot) => {
      received.push(snapshot.commands.find(({ name }) => name === 'clear')?.enabled ?? true);
    });
    expect(await manager.edit({ name: ' CLEAR ', setting: { enabled: false } })).toEqual({ ok: true });
    unsubscribe();
    expect(received).toEqual([false]);
    expect(manager.current().source).toBe('home');
    const persisted: unknown = JSON.parse(readFileSync(homeFile(home), 'utf8'));
    expect(persisted).toHaveProperty('clear', { enabled: false, agentAccess: true });
    expect(persisted).not.toHaveProperty('unknown command');
  });

  it('edits a project override in place and re-reads external changes before saving', async () => {
    const { root, home, manager } = fixture();
    put(homeFile(home), '{"quit":{"enabled":false}}');
    put(projectFile(root), '{"clear":{"enabled":false}}');
    put(projectFile(root), '{"clear":{"enabled":false},"quit":{"agentAccess":false}}');
    expect(await manager.edit({ name: 'clear', setting: { enabled: true } })).toEqual({ ok: true });
    expect(manager.current().source).toBe('project');
    expect(JSON.parse(readFileSync(projectFile(root), 'utf8'))).toHaveProperty('quit', { enabled: true, agentAccess: false });
    expect(JSON.parse(readFileSync(homeFile(home), 'utf8'))).toHaveProperty('quit', { enabled: false });
  });

  it('retains saved child values while deriving parent and native-agent availability', async () => {
    const { home, manager } = fixture();
    put(homeFile(home), JSON.stringify({
      db: { enabled: false },
      'db sqlite query': { enabled: true, agentAccess: false },
    }));
    manager.refresh();
    const query = manager.current().commands.find(({ name }) => name === 'db sqlite query');
    expect(query).toMatchObject({ enabled: true, agentAccess: false, effectiveEnabled: false, effectiveAgentAccess: false });
    expect(await manager.edit({ name: 'db sqlite query', setting: { enabled: false } })).toEqual({ ok: true });
    expect(manager.current().commands.find(({ name }) => name === 'db sqlite query')).toMatchObject({ enabled: false, effectiveEnabled: false });
  });

  it('returns the exact write failure and leaves the published snapshot unchanged', async () => {
    const { root, home, manager } = fixture();
    put(path.join(home, '.janissary'), 'blocking file');
    const before = manager.current();
    expect(await manager.edit({ name: 'clear', setting: { enabled: false } })).toEqual({
      ok: false,
      message: `Could not write commands.json at ${homeFile(home)}.`,
    });
    expect(manager.current()).toBe(before);
    expect(existsSync(projectFile(root))).toBe(false);
  });

  it('allows overlapping edits to publish each successful full-file write', async () => {
    const { home, manager } = fixture();
    const publications: boolean[] = [];
    manager.subscribe((snapshot) => {
      publications.push(snapshot.commands.find(({ name }) => name === 'clear')?.enabled ?? true);
    });
    const results = await Promise.all([
      manager.edit({ name: 'clear', setting: { enabled: false } }),
      manager.edit({ name: 'clear', setting: { enabled: true } }),
    ]);
    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(publications).toEqual([false, true]);
    expect(JSON.parse(readFileSync(homeFile(home), 'utf8'))).toHaveProperty('clear.enabled', true);
  });

  it('disables one built-in fixed form without disabling its sibling forms or parent', async () => {
    const { manager } = fixture();
    expect(await manager.edit({ name: 'tab dock', setting: { enabled: false } })).toEqual({ ok: true });
    const enabled = (name: string): boolean | undefined => manager.current().commands
      .find((row) => row.name === name)?.effectiveEnabled;
    expect(enabled('tab dock')).toBe(false);
    expect(enabled('tab focus')).toBe(true);
    expect(enabled('tab')).toBe(true);
  });

  it('refuses a name with trailing text without writing', async () => {
    const { home, manager } = fixture();
    expect(await manager.edit({ name: 'browser content extra', setting: { enabled: false } }))
      .toEqual({ ok: false, message: 'Unknown application command: browser content extra.' });
    expect(existsSync(homeFile(home))).toBe(false);
    expect(await manager.edit({ name: '  EXIT ', setting: { enabled: false } })).toEqual({ ok: true });
  });

  it('disables every fixed form when the parent command is disabled', async () => {
    const { manager } = fixture();
    await manager.edit({ name: 'tab', setting: { enabled: false } });
    expect(manager.current().commands.find((row) => row.name === 'tab undock')?.effectiveEnabled).toBe(false);
  });
});
