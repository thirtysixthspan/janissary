import { describe, it, expect, vi } from 'vitest';
import { TabManager } from './tab/manager.js';
import type { Managers } from './managers.js';
import { projectFilesFor } from './project-files.js';

vi.mock('./file-tree/search.js', () => ({
  listProjectFiles: vi.fn(async () => ['a.ts', 'b.ts']),
}));

function makeManagers(): Managers {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  return managers;
}

describe('projectFilesFor', () => {
  it('resolves the launch directory paths from listProjectFiles', async () => {
    const managers = makeManagers();
    const result = await projectFilesFor(managers);
    expect(result).toEqual({ root: managers.tab.launchDir, paths: ['a.ts', 'b.ts'] });
  });
});
