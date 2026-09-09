import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { NOTIFICATIONS_LABEL } from '../notifications-tab.js';
import { fakeNotificationsHost } from '../notifications-tab-test-fixture.js';
import { createEditorControllerAdapter } from './editor-adapter.js';

const EDITOR_URL = '/open/a1b2';

function makeManagers(options: { notifications?: boolean } = {}) {
  const editorTab = { label: 'notes.ts', dotColor: '#abc', editor: { url: EDITOR_URL }, log: [] };
  const active = { label: 'janus', dotColor: '#def', log: [] };
  const notifications = { label: NOTIFICATIONS_LABEL, view: 'notifications', log: [] };
  const append = vi.fn();
  const tabs = [
    editorTab,
    active,
    ...(options.notifications === false ? [] : [notifications]),
  ];
  const managers = {
    tab: {
      tabs,
      byLabel: (label: string) => tabs.find((t) => t.label === label),
      editorTabByUrl: (url: string) => tabs.find((t) => t.editor?.url === url),
      append,
      cur: () => active,
      ...fakeNotificationsHost(tabs),
    },
  } as unknown as Managers;
  return { append, managers };
}

describe('editorPluginFailed', () => {
  it('posts one notification naming the plugin and the reason', () => {
    const { append, managers } = makeManagers();
    createEditorControllerAdapter(managers)
      .editorPluginFailed(EDITOR_URL, 'commenting', 'exports no handler');

    expect(append).toHaveBeenCalledExactlyOnceWith(
      NOTIFICATIONS_LABEL,
      expect.objectContaining({
        input: '',
        output: 'Editor plugin "commenting" disabled: exports no handler.',
      }),
    );
  });

  it('attributes the line to the editor tab the chord was pressed in', () => {
    const { append, managers } = makeManagers();
    createEditorControllerAdapter(managers).editorPluginFailed(EDITOR_URL, 'commenting', 'broke');

    expect(append).toHaveBeenCalledWith(
      NOTIFICATIONS_LABEL,
      expect.objectContaining({ from: expect.stringContaining('notes.ts') }),
    );
  });

  // `ownerLabel` falls back to the active tab when the editor tab has already closed, so a stale
  // report still lands rather than throwing on the way out.
  it('falls back to the active tab for a url no open editor holds', () => {
    const { append, managers } = makeManagers();
    expect(() => {
      createEditorControllerAdapter(managers).editorPluginFailed('/open/gone', 'commenting', 'broke');
    }).not.toThrow();

    expect(append).toHaveBeenCalledWith(
      NOTIFICATIONS_LABEL,
      expect.objectContaining({ from: expect.stringContaining('janus') }),
    );
  });

  it('opens the feed and posts into it when none was open', () => {
    const { append, managers } = makeManagers({ notifications: false });
    createEditorControllerAdapter(managers).editorPluginFailed(EDITOR_URL, 'commenting', 'broke');
    expect(managers.tab.tabs.some((t) => t.view === 'notifications')).toBe(true);
    expect(append).toHaveBeenCalledWith(
      NOTIFICATIONS_LABEL,
      expect.objectContaining({ output: 'Editor plugin "commenting" disabled: broke.' }),
    );
  });
});
