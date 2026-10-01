import { describe, it, expect } from 'vitest';
import type { EditorView } from '@shared/protocol';
import { opensRenameSession } from './new-file-rename';

function makeView(overrides: Partial<EditorView> = {}): EditorView {
  return { name: 'untitled.md', path: '/home/user/untitled.md', size: 'unknown', url: '/open/1', ...overrides };
}

describe('opensRenameSession', () => {
  it('starts the rename for a new file whose name was picked for the user', () => {
    expect(opensRenameSession(makeView({ newFile: true }))).toBe(true);
  });

  it('skips the rename for a new file named when it was opened', () => {
    expect(opensRenameSession(makeView({ newFile: true, named: true }))).toBe(false);
  });

  it('skips the rename for a file that already exists', () => {
    expect(opensRenameSession(makeView({ name: 'notes.txt', size: '12 B' }))).toBe(false);
  });
});
