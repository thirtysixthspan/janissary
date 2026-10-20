import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import type { Managers } from '../managers.js';
import type { TabPluginDeclaration } from './api.js';
import { projectCapabilities } from './project-capabilities.js';

let launchDir: string;
let tracked: Set<string>;
let enabled: boolean;

function capabilities(): ReturnType<typeof projectCapabilities> {
  const managers = {
    tab: { launchDir },
    workspace: { tracks: (dir: string) => tracked.has(dir) },
  } as unknown as Managers;
  return projectCapabilities({
    managers,
    declaration: { id: 'search' } as unknown as TabPluginDeclaration,
    origin: { label: 'search', command: 'search' },
    isEnabled: () => enabled,
  });
}

describe('projectCapabilities', () => {
  beforeEach(() => {
    launchDir = mkdtempSync(path.join(tmpdir(), 'project-capabilities-'));
    tracked = new Set();
    enabled = true;
    writeFileSync(path.join(launchDir, 'top.txt'), 'top');
    mkdirSync(path.join(launchDir, 'clone', 'src'), { recursive: true });
    writeFileSync(path.join(launchDir, 'clone', 'src', 'inner.ts'), 'inner');
  });

  afterEach(() => {
    rmSync(launchDir, { recursive: true, force: true });
  });

  it('answers the launch directory list unchanged without a root', async () => {
    const result = await capabilities().projectFileList();
    expect(result.root).toBe(launchDir);
    expect(result.paths).toEqual(expect.arrayContaining(['top.txt', 'clone/src/inner.ts']));
  });

  it('lists a root inside the launch directory relative to that root', async () => {
    const root = path.join(launchDir, 'clone');
    const result = await capabilities().projectFileList(root);
    expect(result).toEqual({ root, paths: ['src/inner.ts'] });
  });

  it('answers an empty list for a root outside the launch directory', async () => {
    const result = await capabilities().projectFileList(path.dirname(launchDir));
    expect(result).toEqual({ root: '', paths: [] });
  });

  it('reports whether a clone inside the launch directory is tracked', () => {
    const clone = path.join(launchDir, 'clone');
    tracked.add(clone);
    expect(capabilities().workspaceTracked(clone)).toBe(true);
    expect(capabilities().workspaceTracked(`${clone}/`)).toBe(true);
    tracked.delete(clone);
    expect(capabilities().workspaceTracked(clone)).toBe(false);
  });

  it('is false for a directory outside the launch directory even when tracked', () => {
    const outside = path.join(path.dirname(launchDir), 'elsewhere');
    tracked.add(outside);
    expect(capabilities().workspaceTracked(outside)).toBe(false);
  });

  it('answers empty values while the plugin is disabled', async () => {
    const clone = path.join(launchDir, 'clone');
    tracked.add(clone);
    enabled = false;
    expect(await capabilities().projectFileList()).toEqual({ root: '', paths: [] });
    expect(await capabilities().projectFileList(clone)).toEqual({ root: '', paths: [] });
    expect(capabilities().workspaceTracked(clone)).toBe(false);
  });
});
