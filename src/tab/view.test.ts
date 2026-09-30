import { describe, it, expect } from 'vitest';
import { buildTabView, buildTabViews } from './view.js';
import { makeTab } from './index.js';
import type { Managers } from '../managers.js';
import type { Tab } from './types.js';

describe('buildTabView', () => {
  it('projects right-pane membership and keeps left as the absent wire value', () => {
    const tab = makeTab('agent-1', '#fff');
    expect(buildTabView(tab, false, '/tmp', undefined, [], [], [], (path) => path).pane).toBeUndefined();
    tab.pane = 'right';
    expect(buildTabView(tab, false, '/tmp', undefined, [], [], [], (path) => path).pane).toBe('right');
  });

  it('never includes editorDraft in the TabView sent to clients', () => {
    const tab = makeTab('agent-1', '#fff');
    tab.editor = { name: 'notes.txt', path: '/tmp/notes.txt', size: '8 B', url: '/open/1' };
    tab.editorDraft = { content: 'unsaved keystrokes', updatedAt: Date.now() };
    const view = buildTabView(tab, false, '/tmp', undefined, [], [], [], (p) => p);
    expect('editorDraft' in view).toBe(false);
    expect(view.editor).toEqual(tab.editor);
  });

  // The two `sessionTerminated` fields hold the same text for different purposes: the tab's copy is the
  // server's own gate on a dead session and has no client reader, while the harness view's copy is
  // what the tab shows in place of `exited`.
  it('keeps the tab-level sessionTerminated off the wire while the harness view carries it', () => {
    const tab = makeTab('claude', '#fff');
    const ended = 'Remote janus on devbox terminated.';
    tab.view = 'harness';
    tab.harness = { name: 'claude', program: 'claude', ptyId: 'pty1', status: 'exited', sessionTerminated: ended };
    tab.sessionTerminated = ended;
    const view = buildTabView(tab, false, '/tmp', undefined, [], [], [], (path) => path);
    expect('sessionTerminated' in view).toBe(false);
    expect(view.harness?.sessionTerminated).toBe(ended);
  });

  // The metadata row's attach control exists to be offered while a transport is being retried, and
  // the only thing that knows a transport is being retried is the channel. Resolved at view time so
  // there is no copy of it on the tab to outlive the recovery.
  it('carries the channel\'s reconnecting state onto the remote target', () => {
    const tab = makeTab('claude', '#fff');
    tab.remote = { address: 'devbox', host: 'devbox' };
    const view = buildTabView(
      tab, false, '/tmp', undefined, [], [], [], (path) => path, undefined,
      () => '/srv/ws', () => true,
    );
    expect(view.remote).toEqual({ address: 'devbox', host: 'devbox', reconnecting: true });
  });

  it('leaves the key off a remote target whose channel is healthy', () => {
    const tab = makeTab('claude', '#fff');
    tab.remote = { address: 'devbox', host: 'devbox' };
    const view = buildTabView(
      tab, false, '/tmp', undefined, [], [], [], (path) => path, undefined,
      () => '/srv/ws', () => false,
    );
    expect(view.remote).toEqual({ address: 'devbox', host: 'devbox' });
  });

  // The provisioning test is the channel's own workspace-absence test — the one detach refuses on —
  // so a busy cwd-less stretch on a live session can never read as still provisioning.
  it('carries the channel\'s provisioning state onto the remote target', () => {
    const tab = makeTab('claude', '#fff');
    tab.remote = { address: 'devbox', host: 'devbox' };
    const view = buildTabView(
      tab, false, '/tmp', undefined, [], [], [], (path) => path, undefined,
      (label: string) => ({ [label]: undefined })[label], () => false,
    );
    expect(view.remote).toEqual({ address: 'devbox', host: 'devbox', provisioning: true });
  });

  it('drops the provisioning key once the channel\'s workspace has landed', () => {
    const tab = makeTab('claude', '#fff');
    tab.remote = { address: 'devbox', host: 'devbox' };
    const view = buildTabView(
      tab, false, '/tmp', undefined, [], [], [], (path) => path, undefined,
      () => '/srv/proj/.janissary/workspace/claude',
    );
    expect(view.remote).toEqual({ address: 'devbox', host: 'devbox' });
  });

  it('never marks a non-remote tab provisioning, even with a local workspace', () => {
    const tab = makeTab('agent-1', '#fff');
    tab.workspaceDir = '/tmp/clone';
    const view = buildTabView(tab, false, '/tmp', undefined, [], [], [], (path) => path);
    expect(view.remote).toBeUndefined();
    expect('provisioning' in (view.remote ?? {})).toBe(false);
  });

  it('projects only the public plugin envelope onto the wire', () => {
    const tab = makeTab('video', '#fff');
    tab.view = 'plugin';
    tab.plugin = {
      id: 'video', instanceKey: '/tmp/private.mp4', schemaVersion: 1,
      payload: { name: 'clip.mp4', url: '/open/abc' },
      fileRefs: ['abc'], sourceLabel: 'janus',
    };
    const view = buildTabView(tab, false, '/tmp', undefined, [], [], [], (path) => path);
    expect(view.plugin).toEqual({
      id: 'video', schemaVersion: 1, payload: { name: 'clip.mp4', url: '/open/abc' },
    });
    expect(view.plugin).not.toHaveProperty('instanceKey');
    expect(view.plugin).not.toHaveProperty('fileRefs');
    expect(view.plugin).not.toHaveProperty('sourceLabel');
  });

  it('includes \'workspaced\' in flags when the tab has a workspaceDir', () => {
    const tab = makeTab('agent-1', '#fff');
    tab.workspaceDir = '/tmp/clone';
    const view = buildTabView(tab, false, '/tmp', undefined, [], [], [], (p) => p);
    expect(view.flags).toContain('workspaced');
  });

  // A remote tab is workspaced too — its clone just lives on the other host, so it deliberately
  // carries no local `workspaceDir` for the flag to be derived from.
  it('includes \'workspaced\' in flags for a remote tab with no workspaceDir', () => {
    const tab = makeTab('claude', '#fff');
    tab.remote = { address: 'admin@devbox:/srv/proj', host: 'devbox' };
    const view = buildTabView(tab, false, '/srv/proj', undefined, [], [], [], (p) => p);
    expect(tab.workspaceDir).toBeUndefined();
    expect(view.flags).toContain('workspaced');
  });

  it('carries the remote destination onto the wire so the client can render the host chip', () => {
    const tab = makeTab('claude', '#fff');
    tab.remote = { address: 'admin@devbox:/srv/proj', host: 'devbox' };
    const view = buildTabView(tab, false, '/srv/proj', undefined, [], [], [], (p) => p);
    expect(view.remote).toEqual({ address: 'admin@devbox:/srv/proj', host: 'devbox' });
  });

  it('leaves remote unset on the wire for an ordinary tab', () => {
    const view = buildTabView(makeTab('agent-1', '#fff'), false, '/tmp', undefined, [], [], [], (p) => p);
    expect(view.remote).toBeUndefined();
  });

  it('includes \'autoApprove\' in flags when the tab has autoApprove set', () => {
    const tab = makeTab('agent-1', '#fff');
    tab.autoApprove = true;
    const view = buildTabView(tab, false, '/tmp', undefined, [], [], [], (p) => p);
    expect(view.flags).toContain('autoApprove');
  });

  it('includes \'browser\' in flags for a tab launched with -b', () => {
    const tab = makeTab('claude', '#fff');
    tab.browser = true;
    const view = buildTabView(tab, false, '/tmp', undefined, [], [], [], (p) => p);
    expect(view.flags).toContain('browser');
  });

  // The flag stands for the tab's `-b` launch, so a gone-browser report, which the band carries,
  // leaves it lit. See the Metadata row in `tabs.md`.
  it('keeps \'browser\' in flags once the harness reports a browser gone', () => {
    const tab = makeTab('claude', '#fff');
    tab.browser = true;
    tab.harness = { name: 'claude', program: 'claude', ptyId: 'pty-1', status: 'running' };
    expect(buildTabView(tab, false, '/tmp', undefined, [], [], [], (p) => p).flags).toContain('browser');
    tab.harness.browserError = 'e2e browser exited';
    expect(buildTabView(tab, false, '/tmp', undefined, [], [], [], (p) => p).flags).toEqual(['browser']);
  });

  describe('while a browser is in use', () => {
    const flagsOf = (tab: ReturnType<typeof makeTab>) => buildTabView(tab, false, '/tmp', undefined, [], [], [], (p) => p).flags;

    function browserTab() {
      const tab = makeTab('claude', '#fff');
      tab.browser = true;
      tab.harness = { name: 'claude', program: 'claude', ptyId: 'pty-1', status: 'running' };
      return tab;
    }

    it('reports \'browserInUse\' in place of \'browser\' once a browser has started', () => {
      const tab = browserTab();
      tab.harness!.browserRunning = true;
      expect(flagsOf(tab)).toEqual(['browserInUse']);
    });

    it('returns to the plain \'browser\' flag when that browser is reported gone', () => {
      const tab = browserTab();
      tab.harness!.browserRunning = true;
      tab.harness!.browserError = 'e2e browser exited';
      delete tab.harness!.browserRunning;
      expect(flagsOf(tab)).toEqual(['browser']);
    });

    // The band keeps the earlier death on record, but a browser is in use again.
    it('reports \'browserInUse\' for a fresh browser a later connect started after a death', () => {
      const tab = browserTab();
      tab.harness!.browserError = 'e2e browser exited';
      tab.harness!.browserRunning = true;
      expect(flagsOf(tab)).toEqual(['browserInUse']);
    });

    it('keeps its place after the workspaced and auto-permitting flags', () => {
      const tab = browserTab();
      tab.workspaceDir = '/tmp/clone';
      tab.autoApprove = true;
      tab.harness!.browserRunning = true;
      expect(flagsOf(tab)).toEqual(['workspaced', 'autoApprove', 'browserInUse']);
    });

    it('is never reported for a tab not launched with -b', () => {
      const tab = browserTab();
      tab.browser = false;
      tab.harness!.browserRunning = true;
      expect(flagsOf(tab)).toEqual([]);
    });
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

  it('orders every active identifier workspaced, autoApprove, browser', () => {
    const tab = makeTab('claude', '#fff');
    tab.workspaceDir = '/tmp/clone';
    tab.autoApprove = true;
    tab.browser = true;
    const view = buildTabView(tab, false, '/tmp', undefined, [], [], [], (p) => p);
    expect(view.flags).toEqual(['workspaced', 'autoApprove', 'browser']);
  });

  it('abbreviates cwd using the given shorten callback rather than the raw value', () => {
    const tab = makeTab('agent-1', '#fff');
    const view = buildTabView(tab, false, '/Users/derrick/project', undefined, [], [], [], () => '~/project');
    expect(view.cwd).toBe('~/project');
  });

  it('reads the workspace dir itself as $workspace/<name> for a locally workspaced tab', () => {
    const tab = makeTab('agent-1', '#fff');
    tab.workspaceDir = '/tmp/clone';
    const view = buildTabView(tab, false, '/tmp/clone', undefined, [], [], [], (p) => p);
    expect(view.cwdDisplay).toBe('$workspace/clone');
    expect(view.cwd).toBe('/tmp/clone');
  });

  it('reads paths inside the workspace dir as $workspace/<name>/<rest>', () => {
    const tab = makeTab('agent-1', '#fff');
    tab.workspaceDir = '/tmp/clone';
    const view = buildTabView(tab, false, '/tmp/clone/sub',
      undefined, [], [], [], (p) => p);
    expect(view.cwdDisplay).toBe('$workspace/clone/sub');
  });

  it('leaves cwdDisplay unset for a tab whose workspace does not cover the cwd', () => {
    const tab = makeTab('agent-1', '#fff');
    tab.workspaceDir = '/tmp/clone';
    const view = buildTabView(tab, false, '/tmp', undefined, [], [], [], (p) => p);
    expect(view.cwdDisplay).toBeUndefined();
  });

  it('reads a remote tab\'s clone prefix as $workspace/<name> via workspaceOf', () => {
    const tab = makeTab('bekir', '#fff');
    tab.remote = { host: 'devbox', address: 'devbox' };
    const view = buildTabView(
      tab, false, '/srv/.janissary/workspace/bekir/src', undefined, [], [], [], (p) => p,
      undefined, (label) => (label === 'bekir' ? '/srv/.janissary/workspace/bekir' : undefined),
    );
    expect(view.cwdDisplay).toBe('$workspace/bekir/src');
  });

  it('falls back to the ordinary abbreviation once the remote workspace is gone', () => {
    const tab = makeTab('bekir', '#fff');
    tab.remote = { host: 'devbox', address: 'devbox' };
    const remoteWorkspaces: Record<string, string | undefined> = {};
    const view = buildTabView(
      tab, false, '/srv/.janissary/workspace/bekir', undefined, [], [], [], () => 'remote path',
      undefined, (label) => remoteWorkspaces[label],
    );
    expect(view.cwdDisplay).toBeUndefined();
  });

  it('carries the unshortened root as absoluteRoot while root itself is shortened', () => {
    const tab = makeTab('agent-1', '#fff');
    tab.files = { root: '/Users/derrick/project', absoluteRoot: '/Users/derrick/project', rows: [] };
    const view = buildTabView(tab, false, '/tmp', undefined, [], [], [], () => '~/project');
    expect(view.files?.root).toBe('~/project');
    expect(view.files?.absoluteRoot).toBe('/Users/derrick/project');
  });

  it('abbreviates the editor path using the given shorten callback', () => {
    const tab = makeTab('agent-1', '#fff');
    tab.editor = { name: 'notes.txt', path: '/Users/derrick/project/notes.txt', size: '8 B', url: '/open/1' };
    const shorten = (p: string) => (p === tab.editor?.path ? '$root/notes.txt' : p);
    const view = buildTabView(tab, false, '/tmp', undefined, [], [], [], shorten);
    expect(view.editor?.path).toBe('$root/notes.txt');
    expect(view.editor?.name).toBe('notes.txt');
  });

  it('exposes the tab pending question', () => {
    const tab = makeTab('agent-1', '#fff');
    const pending = { id: 'question-1', tab: 'agent-1', kind: 'ask' as const, question: 'What port?' };
    const view = buildTabView(tab, false, '/tmp', undefined, [], [], [], (p) => p, pending);
    expect(view.pendingQuestion).toEqual(pending);
  });
});

// The wrapper every state event goes through. Its two closures are the only readers of the remote
// channel's per-tab state, and they are read at view time precisely so nothing has to be copied onto
// the tab to outlive a reconnect.
describe('buildTabViews', () => {
  const noAcp = (): undefined => undefined;
  const noQuestion = (): PendingQuestion | undefined => undefined;
  const noWorkspace = (): string | undefined => undefined;

  function remoteManagers(overrides: {
    workspaceOf?: (label: string) => string | undefined;
    reconnectingOf?: (label: string) => boolean;
    pendingFor?: (label: string) => PendingQuestion | undefined;
  } = {}) {
    return {
      questions: { pendingFor: overrides.pendingFor ?? noQuestion },
      remote: {
        workspaceOf: overrides.workspaceOf ?? noWorkspace,
        reconnectingOf: overrides.reconnectingOf ?? (() => false),
      },
    } as unknown as Managers;
  }

  function remoteTab(label: string, overrides: Partial<Tab> = {}): Tab {
    const tab = makeTab(label, '#fff');
    tab.view = 'harness';
    tab.harness = { name: 'claude', program: 'claude', ptyId: 'pty1', status: 'running' };
    tab.remote = { host: 'devbox', address: 'devbox:/srv/project' };
    return Object.assign(tab, overrides);
  }

  const build = (tabs: Tab[], managers: Managers) => buildTabViews(
    tabs, managers, () => [], noAcp, () => [], (path) => path,
  );

  it('maps every tab in strip order', () => {
    const tabs = [makeTab('janus', '#fff'), makeTab('notes', '#fff')];
    expect(build(tabs, remoteManagers()).map((view) => view.label)).toEqual(['janus', 'notes']);
  });

  it('reads each tab\'s workspace from the channel rather than the tab', () => {
    const views = build([remoteTab('a'), remoteTab('b')], remoteManagers({
      workspaceOf: (label) => (label === 'a' ? '/remote/a' : '/remote/b'),
    }));

    expect(views.map((view) => view.flags)).toEqual([['workspaced'], ['workspaced']]);
    expect(views.every((view) => !('provisioning' in (view.remote ?? {})))).toBe(true);
  });

  it('marks a remote tab still waiting for its channel to name a workspace as provisioning', () => {
    const views = build([remoteTab('a')], remoteManagers({ workspaceOf: noWorkspace }));

    expect(views[0]!.remote?.provisioning).toBe(true);
  });

  it('carries the channel\'s reconnecting state onto the remote target', () => {
    const views = build([remoteTab('a')], remoteManagers({
      workspaceOf: () => '/remote/a',
      reconnectingOf: () => true,
    }));

    expect(views[0]!.remote?.reconnecting).toBe(true);
  });

  it('leaves a healthy remote target with neither key set', () => {
    const views = build([remoteTab('a')], remoteManagers({ workspaceOf: () => '/remote/a' }));

    expect(views[0]!.remote).toEqual({ host: 'devbox', address: 'devbox:/srv/project' });
  });

  it('reads each tab\'s pending question from the question manager', () => {
    const pending = { id: 'question-1', tab: 'a', kind: 'ask' as const, question: 'What port?' };
    const views = build([makeTab('a', '#fff')], remoteManagers({ pendingFor: () => pending }));

    expect(views[0]!.pendingQuestion).toEqual(pending);
  });

  it('never marks a local tab from the remote channel\'s answers', () => {
    const views = build([makeTab('a', '#fff')], remoteManagers({
      workspaceOf: () => '/remote/a',
      reconnectingOf: () => true,
    }));

    expect(views[0]!.remote).toBeUndefined();
    expect(views[0]!.flags).toEqual([]);
  });
});
