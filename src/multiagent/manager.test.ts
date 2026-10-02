import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AcpOptions, AcpSession } from '../acp/types.js';
import type { Tab } from '../tab/types.js';
import type { Managers } from '../managers.js';

const mocks = vi.hoisted(() => ({ connectAcp: vi.fn() }));
vi.mock('../acp/index.js', () => ({ connectAcp: mocks.connectAcp }));

import { MultiAgentManager } from './manager.js';
import type { MultiAgentMember } from './types.js';

const KNOWN = 'opencode/big-pickle';
const OTHER = 'google/gemini-3.1-flash-lite';

type Fake = {
  managers: Managers;
  create: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  appended: { input: string; output: string }[];
  tabs: Tab[];
};

// The tab surface the opener needs: a tab list, an active index, and the two mutators it calls.
// A real TabManager would drag in persistence, the shell and the bus; the opener only touches these.
function fakeManager(clones: { dir: string; ready: Promise<void> }[] | 'error' = []): Fake {
  const tabs: Tab[] = [mainTab()];
  let activeTab = 0;
  const appended: { input: string; output: string }[] = [];
  const pending = [...(clones === 'error' ? [] : clones)];
  const release = vi.fn();
  const cancel = vi.fn();
  const create = vi.fn((name: string) => {
    if (clones === 'error') return { error: 'No git repository found. Cannot create workspace.' };
    const next = pending.shift() ?? { dir: `/ws/${name}`, ready: Promise.resolve() };
    return { dir: next.dir, ready: next.ready };
  });
  const managers = {
    tab: {
      tabs,
      get activeTab() { return activeTab; },
      applyOpenResult: (result: { tabs: Tab[]; activeTab: number }) => {
        tabs.length = 0;
        tabs.push(...result.tabs);
        activeTab = result.activeTab;
      },
      setActiveTab: (index: number) => { activeTab = index; },
      byLabel: (label: string) => tabs.find((t) => t.label === label),
      append: (_label: string, entry: { input: string; output: string }) => { appended.push(entry); },
      registerFile: () => '',
      openFiles: new Map<string, string>(),
    },
    workspace: { create, release, cancel },
  } as unknown as Managers;
  return { managers, create, release, cancel, appended, tabs };
}

function mainTab(overrides: Partial<Tab> = {}): Tab {
  return {
    label: 'main', dotColor: 'red', number: 1, group: 1, groupColor: 'red', log: [],
    cmdHistory: [], cmdHistoryIdx: -1, scrollOffset: 0, ...overrides,
  };
}

const session = (): AcpSession => ({ prompt: vi.fn(), kill: vi.fn() });
const memberOf = (tabs: Tab[], index = 0): MultiAgentMember =>
  (tabs.find((t) => t.multiagent)?.multiagent?.members ?? [])[index];

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => { mocks.connectAcp.mockReset(); });

describe('MultiAgentManager member resolution', () => {
  it('runs a member naming a model the opencode catalog carries', () => {
    mocks.connectAcp.mockImplementation(() => session());
    const fake = fakeManager();
    const outcome = new MultiAgentManager(fake.managers).run('main', `fanout opencode:${KNOWN} go`);

    expect(outcome).toMatchObject({ running: 1, skipped: [] });
    expect(fake.create).toHaveBeenCalledWith(`multi-agent-${KNOWN.replaceAll('/', '-')}-0`);
  });

  it('refuses a member naming a model the catalog does not carry, and runs the rest', () => {
    mocks.connectAcp.mockImplementation(() => session());
    const fake = fakeManager();
    const outcome = new MultiAgentManager(fake.managers).run('main', `fanout opencode:${KNOWN} opencode:nope go`);

    expect(outcome).toMatchObject({ running: 1 });
    expect(outcome).toHaveProperty('skipped.0', '"nope" is not an opencode model in the harness catalog.');
    expect(memberOf(fake.tabs, 1).state).toBe('failed');
  });

  it('refuses a member listed twice', () => {
    mocks.connectAcp.mockImplementation(() => session());
    const fake = fakeManager();
    const outcome = new MultiAgentManager(fake.managers).run('main', `fanout opencode:${KNOWN} opencode:${KNOWN} go`);

    expect(outcome).toMatchObject({ running: 1 });
    expect(memberOf(fake.tabs, 1).error).toBe(`"${KNOWN}" is listed more than once.`);
  });

  it('opens no tab and reports why when every member was refused', () => {
    const fake = fakeManager();
    const outcome = new MultiAgentManager(fake.managers).run('main', 'fanout opencode:nope opencode:also-nope go');

    expect(outcome).toHaveProperty('error');
    expect(fake.create).not.toHaveBeenCalled();
    expect(fake.tabs.map((t) => t.label)).toEqual(['main']);
  });

  it('reports a usage error without touching the workspace', () => {
    const fake = fakeManager();
    const outcome = new MultiAgentManager(fake.managers).run('main', 'fanout no members here');

    expect(outcome).toHaveProperty('error', 'Usage: fanout opencode:<model>... <prompt>');
    expect(fake.create).not.toHaveBeenCalled();
  });

  it('titles the tab with the prompt and inherits the creator group', () => {
    mocks.connectAcp.mockImplementation(() => session());
    const fake = fakeManager();
    fake.tabs[0] = mainTab({ group: 4, groupColor: 'blue' });

    new MultiAgentManager(fake.managers).run('main', `fanout opencode:${KNOWN} explain this`);

    const tab = fake.tabs.find((t) => t.label === 'multi-agent');
    expect(tab?.title).toBe('explain this');
    expect(tab?.group).toBe(4);
    expect(tab?.groupColor).toBe('blue');
  });
});

describe('MultiAgentManager prompting', () => {
  it('prompts a member only once its clone is ready', async () => {
    const pending = Promise.withResolvers<void>();
    mocks.connectAcp.mockImplementation(() => session());
    const fake = fakeManager([{ dir: '/ws/a', ready: pending.promise }]);

    new MultiAgentManager(fake.managers).run('main', `fanout opencode:${KNOWN} go`);
    expect(mocks.connectAcp).not.toHaveBeenCalled();

    pending.resolve();
    await flush();

    expect(mocks.connectAcp).toHaveBeenCalledOnce();
    expect(memberOf(fake.tabs).state).toBe('running');
  });

  it('never prompts a member whose clone failed', async () => {
    mocks.connectAcp.mockImplementation(() => session());
    const fake = fakeManager([{ dir: '/ws/a', ready: Promise.reject(new Error('clone aborted')) }]);

    new MultiAgentManager(fake.managers).run('main', `fanout opencode:${KNOWN} go`);
    await flush();

    expect(mocks.connectAcp).not.toHaveBeenCalled();
    expect(memberOf(fake.tabs).state).toBe('failed');
  });

  it('carries the issuing tab offline flag onto the members and the new tab', async () => {
    mocks.connectAcp.mockImplementation(() => session());
    const fake = fakeManager();
    fake.tabs[0] = mainTab({ offline: true });

    new MultiAgentManager(fake.managers).run('main', `fanout opencode:${KNOWN} go`);
    await flush();

    expect((mocks.connectAcp.mock.calls[0][0] as AcpOptions).offline).toBe(true);
    expect(fake.tabs.find((t) => t.label === 'multi-agent')?.offline).toBe(true);
  });

  it('reports a run whose every clone failed as nothing running', () => {
    const fake = fakeManager('error');
    const outcome = new MultiAgentManager(fake.managers).run('main', `fanout opencode:${KNOWN} go`);

    expect(outcome).toMatchObject({ running: 0 });
    expect(memberOf(fake.tabs).error).toBe('No git repository found. Cannot create workspace.');
  });
});

describe('MultiAgentManager teardown', () => {
  it('kills every member session and releases every clone when the tab closes', async () => {
    const first = session();
    const second = session();
    mocks.connectAcp.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const fake = fakeManager();
    const manager = new MultiAgentManager(fake.managers);

    manager.run('main', `fanout opencode:${KNOWN} opencode:${OTHER} go`);
    await flush();
    manager.closeTab('multi-agent');
    await flush();

    expect(first.kill).toHaveBeenCalledOnce();
    expect(second.kill).toHaveBeenCalledOnce();
    expect(fake.release).toHaveBeenCalledWith(`/ws/multi-agent-${KNOWN.replaceAll('/', '-')}-0`);
    expect(fake.release).toHaveBeenCalledWith(`/ws/multi-agent-${OTHER.replaceAll('/', '-')}-1`);
  });

  it('cancels a clone still in flight when the tab closes', async () => {
    mocks.connectAcp.mockImplementation(() => session());
    const fake = fakeManager([{ dir: '/ws/a', ready: new Promise<void>(() => {}) }]);
    const manager = new MultiAgentManager(fake.managers);

    manager.run('main', `fanout opencode:${KNOWN} go`);
    manager.closeTab('multi-agent');

    expect(fake.cancel).toHaveBeenCalledWith(`multi-agent-${KNOWN.replaceAll('/', '-')}-0`);
  });

  it('leaves another tab run alone when one tab closes', async () => {
    const first = session();
    const second = session();
    mocks.connectAcp.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const fake = fakeManager();
    const manager = new MultiAgentManager(fake.managers);

    manager.run('main', `fanout opencode:${KNOWN} go`);
    manager.run('main', `fanout opencode:${OTHER} go`);
    await flush();
    manager.closeTab('multi-agent');

    expect(first.kill).toHaveBeenCalledOnce();
    expect(second.kill).not.toHaveBeenCalled();
  });

  it('sweeps what is left at shutdown', async () => {
    mocks.connectAcp.mockImplementation(() => session());
    const fake = fakeManager();
    const manager = new MultiAgentManager(fake.managers);

    manager.run('main', `fanout opencode:${KNOWN} go`);
    await flush();
    manager.dispose();
    await flush();

    expect(fake.release).toHaveBeenCalledWith(`/ws/multi-agent-${KNOWN.replaceAll('/', '-')}-0`);
  });
});
