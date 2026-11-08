import { describe, expect, it } from 'vitest';
import type { EditorView, TabView } from '@shared/protocol';
import { tabFullName } from './tab-name';

function tab(overrides: Partial<TabView> = {}): TabView {
  return {
    label: 'a', number: 1, dotColor: '#fff', group: 0, groupColor: '#000', busy: false, hasUnread: false,
    cwd: '/repo', connections: [], schedule: [], bufferLines: [], cmdHistory: [], commandQueue: [],
    ...overrides,
  };
}

const EDITOR: EditorView = { name: 'a.txt', path: '/repo/a.txt', size: '1 B', url: '/open/1' };

describe('tabFullName', () => {
  it('returns the editor name when the tab has an editor', () => {
    expect(tabFullName(tab({ label: 'internal', title: 'Short', editor: EDITOR }))).toBe('a.txt');
  });

  it('returns the title when the tab has no editor', () => {
    expect(tabFullName(tab({ label: 'internal', title: 'Display Name' }))).toBe('Display Name');
  });

  it('returns the label when the tab has neither editor nor title', () => {
    expect(tabFullName(tab({ label: 'internal' }))).toBe('internal');
  });

  it('returns an empty editor name rather than falling through to the title', () => {
    expect(tabFullName(tab({ title: 'Display Name', editor: { ...EDITOR, name: '' } }))).toBe('');
  });

  it('returns an empty title rather than falling through to the label', () => {
    expect(tabFullName(tab({ label: 'internal', title: '' }))).toBe('');
  });
});
