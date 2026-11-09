import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NativeCommandSettingsManager } from './manager.js';

const roots: string[] = [];
function fixture(home: string | undefined, project: string | undefined) {
  const base = mkdtempSync(path.join(os.tmpdir(), 'native-command-overridden-'));
  roots.push(base);
  const root = path.join(base, 'project');
  const homeDirectory = path.join(base, 'home');
  const put = (directory: string, content: string | undefined) => {
    if (content === undefined) return;
    mkdirSync(path.join(directory, '.janissary'), { recursive: true });
    writeFileSync(path.join(directory, '.janissary', 'commands.json'), content);
  };
  mkdirSync(root);
  mkdirSync(homeDirectory);
  put(homeDirectory, home);
  put(root, project);
  return new NativeCommandSettingsManager(root, homeDirectory);
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

const HOME = '{"clear":{"enabled":false},"browser eval":{"agentAccess":false}}';

describe('home restrictions lifted by a project commands.json', () => {
  it('names a home disable and a home agent denial that an empty project file lifts', () => {
    const manager = fixture(HOME, '{}');
    expect(manager.current().source).toBe('project');
    expect(manager.current().overridden).toEqual(['browser eval', 'clear']);
  });

  it('omits commands the project file keeps restricted and reports nothing when all are kept', () => {
    const partial = fixture(HOME, '{"clear":{"enabled":false}}');
    expect(partial.current().overridden).toEqual(['browser eval']);
    const kept = fixture(HOME, '{"clear":{"enabled":false},"browser eval":{"agentAccess":false}}');
    expect(kept.current()).not.toHaveProperty('overridden');
  });

  it('reports nothing without a home file, with an unusable home file, or when home is the source', () => {
    expect(fixture(undefined, '{}').current()).not.toHaveProperty('overridden');
    expect(fixture('not-json', '{}').current()).not.toHaveProperty('overridden');
    expect(fixture(HOME, undefined).current()).not.toHaveProperty('overridden');
  });

  it('recomputes the note after an edit to the project file', async () => {
    const manager = fixture(HOME, '{}');
    expect(await manager.edit({ name: 'clear', setting: { enabled: false } })).toEqual({ ok: true });
    expect(manager.current().overridden).toEqual(['browser eval']);
    expect(await manager.edit({ name: 'browser eval', setting: { agentAccess: false } })).toEqual({ ok: true });
    expect(manager.current()).not.toHaveProperty('overridden');
  });
});
