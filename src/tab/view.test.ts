import { describe, it, expect } from 'vitest';
import { buildTabView } from './view.js';
import { makeTab } from './index.js';

describe('buildTabView', () => {
  it('never includes editorDraft in the TabView sent to clients', () => {
    const tab = makeTab('agent-1', '#fff');
    tab.editor = { name: 'notes.txt', path: '/tmp/notes.txt', size: '8 B', url: '/open/1' };
    tab.editorDraft = { content: 'unsaved keystrokes', updatedAt: Date.now() };
    const view = buildTabView(tab, false, '/tmp', undefined, [], [], [], (p) => p);
    expect('editorDraft' in view).toBe(false);
    expect(view.editor).toEqual(tab.editor);
  });
});
