import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Managers } from '../managers.js';
import { NOTIFICATIONS_LABEL } from '../notifications/tab.js';
import { fakeNotificationsHost } from '../notifications/tab-test-fixture.js';
import { NOTIFICATION_QUEUE_LIMIT, NotificationQueue } from '../notifications/queue.js';
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
    notifications: new NotificationQueue(),
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
      NOTIFICATION_QUEUE_LIMIT,
    );
  });

  it('attributes the line to the editor tab the chord was pressed in', () => {
    const { append, managers } = makeManagers();
    createEditorControllerAdapter(managers).editorPluginFailed(EDITOR_URL, 'commenting', 'broke');

    expect(append).toHaveBeenCalledWith(
      NOTIFICATIONS_LABEL,
      expect.objectContaining({ from: expect.stringContaining('notes.ts') }),
      NOTIFICATION_QUEUE_LIMIT,
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
      NOTIFICATION_QUEUE_LIMIT,
    );
  });

  // With no feed open the report toasts rather than docking a sidebar in — but it is still held,
  // so a feed opened afterwards carries it.
  it('opens no feed when none was open, and holds the line in the queue', () => {
    const { append, managers } = makeManagers({ notifications: false });
    createEditorControllerAdapter(managers).editorPluginFailed(EDITOR_URL, 'commenting', 'broke');
    expect(managers.tab.tabs.some((t) => t.view === 'notifications')).toBe(false);
    expect(append).not.toHaveBeenCalled();
    expect(managers.notifications.all.map((n) => n.message))
      .toContain('Editor plugin "commenting" disabled: broke.');
  });
});

// The delegates below are covered against their own managers in `src/editor/*.test.ts`; what is
// left to answer here is the wiring — that each RPC reaches its delegate with the arguments the
// client sent. `editorSuggest` is left alone: it opens a real ACP session to answer, which no fake
// can stand in for.
function makeAdapterManagers(launchDir: string) {
  const base = makeManagers();
  const editorAcp = { close: vi.fn(() => true) };
  const monitor = { stop: vi.fn(() => false) };
  const acp = { label: vi.fn(() => 'reviewer'), close: vi.fn(() => true) };
  const managers = Object.assign(base.managers, {
    tab: Object.assign(base.managers.tab, { launchDir }),
    editorAcp,
    monitor,
    acp,
  }) as unknown as Managers;
  return { managers, editorAcp, monitor, acp };
}

describe('editor adapter wiring', () => {
  it('projectFiles answers the launch directory with its listed paths', async () => {
    const launchDir = mkdtempSync(path.join(tmpdir(), 'janus-editor-adapter-'));
    try {
      const { managers } = makeAdapterManagers(launchDir);
      const result = await createEditorControllerAdapter(managers).projectFiles();
      expect(result.root).toBe(launchDir);
      expect(result.paths).toEqual(expect.any(Array));
    } finally {
      rmSync(launchDir, { recursive: true, force: true });
    }
  });

  it('projectFilesFallback answers the launch directory with no paths', () => {
    const { managers } = makeAdapterManagers('/test/project');
    expect(createEditorControllerAdapter(managers).projectFilesFallback())
      .toEqual({ root: '/test/project', paths: [] });
  });

  it('editorPersonas answers the editor persona list', () => {
    const { managers } = makeAdapterManagers('/test/project');
    expect(createEditorControllerAdapter(managers).editorPersonas()).toEqual(expect.any(Array));
  });

  // The persona's session is addressed by the tab that owns the editor, not by the url, so a url
  // whose editor tab has since closed still has to land on a real connection rather than on nothing.
  it("closeEditorConnection closes the persona connection under the editor tab's own label", () => {
    const { managers, editorAcp } = makeAdapterManagers('/test/project');
    expect(() => {
      createEditorControllerAdapter(managers).closeEditorConnection(EDITOR_URL, 'reviewer');
    }).not.toThrow();
    expect(editorAcp.close).toHaveBeenCalledWith('notes.ts', 'reviewer');
  });

  it('renameEditorFile renames nothing and throws nothing for a url no open editor holds', () => {
    const { managers } = makeAdapterManagers('/test/project');
    expect(() => {
      createEditorControllerAdapter(managers).renameEditorFile('/open/gone', 'b.ts');
    }).not.toThrow();
  });

  it('commitEditorFile commits nothing and throws nothing for a url no open editor holds', () => {
    const { managers } = makeAdapterManagers('/test/project');
    expect(() => {
      createEditorControllerAdapter(managers).commitEditorFile('/open/gone', 'commit: notes.ts');
    }).not.toThrow();
  });
});
