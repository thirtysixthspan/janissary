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

  it('includes \'workspaced\' in flags when the tab has a workspaceDir', () => {
    const tab = makeTab('agent-1', '#fff');
    tab.workspaceDir = '/tmp/clone';
    const view = buildTabView(tab, false, '/tmp', undefined, [], [], [], (p) => p);
    expect(view.flags).toContain('workspaced');
  });

  it('includes \'autoApprove\' in flags when the tab has autoApprove set', () => {
    const tab = makeTab('agent-1', '#fff');
    tab.autoApprove = true;
    const view = buildTabView(tab, false, '/tmp', undefined, [], [], [], (p) => p);
    expect(view.flags).toContain('autoApprove');
  });

  it('produces an empty flags array when neither workspaceDir nor autoApprove is set', () => {
    const tab = makeTab('agent-1', '#fff');
    const view = buildTabView(tab, false, '/tmp', undefined, [], [], [], (p) => p);
    expect(view.flags).toEqual([]);
  });

  it('includes both identifiers when the tab has workspaceDir and autoApprove', () => {
    const tab = makeTab('agent-1', '#fff');
    tab.workspaceDir = '/tmp/clone';
    tab.autoApprove = true;
    const view = buildTabView(tab, false, '/tmp', undefined, [], [], [], (p) => p);
    expect(view.flags).toEqual(['workspaced', 'autoApprove']);
  });

  it('abbreviates cwd using the given shorten callback rather than the raw value', () => {
    const tab = makeTab('agent-1', '#fff');
    const view = buildTabView(tab, false, '/Users/derrick/project', undefined, [], [], [], () => '~/project');
    expect(view.cwd).toBe('~/project');
  });
});
