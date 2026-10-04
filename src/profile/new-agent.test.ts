import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  sandboxNotice: vi.fn(() => undefined as string | undefined),
  startRemoteAgent: vi.fn(),
}));
vi.mock('../notifications/index.js', () => ({ notify: mocks.notify }));
vi.mock('../sandbox/index.js', () => ({ sandboxNotice: mocks.sandboxNotice }));
vi.mock('./remote-agent.js', () => ({ startRemoteAgent: mocks.startRemoteAgent }));

vi.mock('../launch-name/leftover.js', () => ({
  isWorkspaceRunning: vi.fn(() => false),
  hasLeftoverWorkspace: vi.fn(() => false),
  removeLeftoverWorkspace: vi.fn((): string | undefined => undefined),
}));

import { newAgentOp } from './new-agent.js';
import { loadHarnessModels } from '../harness/models.js';
import { makeTab } from '../tab/index.js';
import { initWorkspaceDir } from '../workspace/index.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';

initWorkspaceDir('/proj');

const CATALOG = ['scout-model', 'other-model'];
let root: string;

function makeManagers(creator: Tab, tabs: Tab[] = [creator]): { managers: Managers; appended: { input: string; output: string }[] } {
  const appended: { input: string; output: string }[] = [];
  const managers = {
    tab: {
      tabs,
      byLabel: (label: string) => tabs.find((t: Tab) => t.label === label),
      append: (_label: string, entry: { input: string; output: string }) => { appended.push(entry); },
      allLabels: () => tabs.map((t) => t.label),
      cur: () => creator,
      insertTabInGroup: vi.fn((tab: Tab) => { tabs.push(tab); }),
      setCwd: vi.fn(),
      addBusy: vi.fn(),
      deleteBusy: vi.fn(),
      setActiveTab: vi.fn(),
      findIndex: vi.fn(() => tabs.length - 1),
      closeTab: vi.fn(),
      persist: vi.fn(),
      buildAgentState: vi.fn(() => ({ name: creator.label, dotColor: creator.dotColor, active: true })),
      shorten: (p: string) => p,
      cwdOf: () => '/proj',
      launchDir: '/proj',
      activeTab: 0,
    },
    workspace: { create: vi.fn(), preflight: vi.fn((): string | undefined => undefined) },
    openFile: { edit: vi.fn() },
    monitor: { snapshot: vi.fn(() => []) },
    sessions: { view: vi.fn(() => []) },
    remote: { get: vi.fn() },
  } as unknown as Managers;
  return { managers, appended };
}

describe('newAgentOp — --model', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    root = mkdtempSync(path.join(tmpdir(), 'janus-newagent-'));
    mkdirSync(path.join(root, '.janissary'), { recursive: true });
    writeFileSync(path.join(root, '.janissary', 'harness-models.json'), JSON.stringify({ opencode: CATALOG }));
    loadHarnessModels(root);
    vi.spyOn(messageBus, 'emit').mockReturnValue(undefined);
  });

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('records a catalog model on the tab it opens', () => {
    const janus = makeTab('janus', 'red');
    const { managers } = makeManagers(janus);
    newAgentOp(managers, 'agent scout --no-workspace --model scout-model');
    const scout = managers.tab.tabs.at(-1)!;
    expect(scout.label).toBe('scout');
    expect(scout.acpModel).toBe('scout-model');
  });

  it('leaves the model unset when no flag was given', () => {
    const janus = makeTab('janus', 'red');
    const { managers } = makeManagers(janus);
    newAgentOp(managers, 'agent scout --no-workspace');
    expect(managers.tab.tabs.at(-1)!.acpModel).toBeUndefined();
  });

  it('refuses a model the catalog does not offer, and opens no tab', () => {
    const janus = makeTab('janus', 'red');
    const { managers, appended } = makeManagers(janus);
    newAgentOp(managers, 'agent scout --no-workspace --model not/a-model');
    expect(appended.at(-1)!.output)
      .toBe('Unknown model "not/a-model" for harness "opencode" — add it to harness-models.json.');
    expect(managers.tab.tabs).toHaveLength(1);
  });

  it('refuses before any workspace work, so a bad model leaves no clone behind', () => {
    const janus = makeTab('janus', 'red');
    const { managers } = makeManagers(janus);
    newAgentOp(managers, 'agent scout --model not/a-model');
    expect(managers.workspace.create).not.toHaveBeenCalled();
    expect(managers.tab.tabs).toHaveLength(1);
  });

  it('reports a valueless --model as a usage error', () => {
    const janus = makeTab('janus', 'red');
    const { managers, appended } = makeManagers(janus);
    newAgentOp(managers, 'agent scout --no-workspace --model');
    expect(appended.at(-1)!.output).toBe('Usage: agent <name> --model <model-id>.');
    expect(managers.tab.tabs).toHaveLength(1);
  });

  it('carries the model into a remote launch', () => {
    const janus = makeTab('janus', 'red');
    const { managers } = makeManagers(janus);
    newAgentOp(managers, 'agent scout on devbox --model scout-model');
    expect(mocks.startRemoteAgent).toHaveBeenCalledWith(
      managers,
      expect.objectContaining({ resolved: 'scout', model: 'scout-model' }),
    );
  });
});

describe('newAgentOp — delegation depth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    root = mkdtempSync(path.join(tmpdir(), 'janus-newagent-depth-'));
    loadHarnessModels(root);
    vi.spyOn(messageBus, 'emit').mockReturnValue(undefined);
  });

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('gives a root tab\'s worker depth 1', () => {
    const janus = makeTab('janus', 'red');
    const { managers } = makeManagers(janus);
    newAgentOp(managers, 'agent scout --no-workspace');
    expect(managers.tab.tabs.at(-1)!.agentDepth).toBe(1);
  });

  it('counts a chain of creators', () => {
    const janus = makeTab('janus', 'red');
    const { managers } = makeManagers(janus);
    newAgentOp(managers, 'agent scout --no-workspace');
    const scout = managers.tab.tabs.at(-1)!;
    const fromScout = makeManagers(scout, managers.tab.tabs);
    newAgentOp(fromScout.managers, 'agent kaptan --no-workspace');
    expect(managers.tab.tabs.at(-1)!.label).toBe('kaptan');
    expect(managers.tab.tabs.at(-1)!.agentDepth).toBe(2);
  });
});