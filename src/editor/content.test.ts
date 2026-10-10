import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Managers } from '../managers.js';
import { currentEditorContent } from './content.js';

const directory = mkdtempSync(path.join(tmpdir(), 'janus-editor-content-'));

afterAll(() => { rmSync(directory, { recursive: true, force: true }); });

function managers(filePath?: string): Managers {
  return { tab: { openFilePath: () => filePath } } as unknown as Managers;
}

describe('currentEditorContent', () => {
  it('prefers the live draft over the file', () => {
    const file = path.join(directory, 'draft.txt');
    writeFileSync(file, 'saved content');

    expect(currentEditorContent(managers(file), { content: 'unsaved draft' }, '/open/1'))
      .toBe('unsaved draft');
  });

  it('reads the file resolved by the registered editor reference', () => {
    const file = path.join(directory, 'saved.txt');
    writeFileSync(file, 'saved content');

    expect(currentEditorContent(managers(file), undefined, '/open/2')).toBe('saved content');
  });

  it('omits a new editor file with no draft and no registered path', () => {
    expect(currentEditorContent(managers(), undefined, '/open/3')).toBeUndefined();
  });
});
