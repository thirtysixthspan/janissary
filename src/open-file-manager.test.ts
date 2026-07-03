import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { OpenFileManager } from './open-file-manager.js';
import type { Managers } from './managers.js';

describe('OpenFileManager.edit', () => {
  it('opens the editor for a new file that does not exist on disk', () => {
    const appended: string[] = [];
    const opened: string[] = [];
    const managers = {
      tab: {
        cwdOf: () => '/working',
        append: (_label: string, _entry: unknown) => { appended.push(JSON.stringify(_entry)); },
        openEditorTab: (view: { path: string }) => { opened.push(view.path); },
        registerFile: (p: string) => `/open/test-${p.length}`,
      },
    } as unknown as Managers;
    const mgr = new OpenFileManager(managers);

    mgr.edit('edit newfile.txt', 'newfile.txt', 'janus');

    expect(opened).toHaveLength(1);
    expect(opened[0]).toBe(path.resolve('/working', 'newfile.txt'));
    expect(appended).toHaveLength(0);
  });

  it('opens the editor for an absolute new file path', () => {
    const opened: string[] = [];
    const managers = {
      tab: {
        cwdOf: () => '/working',
        append: () => {},
        openEditorTab: (view: { path: string }) => { opened.push(view.path); },
        registerFile: (p: string) => `/open/test-${p.length}`,
      },
    } as unknown as Managers;
    const mgr = new OpenFileManager(managers);

    mgr.edit('edit /tmp/newfile.txt', '/tmp/newfile.txt', 'janus');

    expect(opened).toHaveLength(1);
    expect(opened[0]).toBe('/tmp/newfile.txt');
  });
});
