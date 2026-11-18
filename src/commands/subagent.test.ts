import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Managers } from '../managers.js';
import type { CommandInvocationContext } from './types.js';
import type { Tab, TabRuntime } from '../tab/types.js';
import type { AcpDispatchReceipt } from '../acp/response.js';
import type * as LaunchModule from '../subagent/launch.js';
import type { SubagentLaunchOptions } from '../subagent/launch.js';
import { acpAvailable } from '../acp/availability.js';
import { isSubagentCommandLine } from '../subagent/primer.js';
import { runSubagentCommand } from '../subagent/command-policy.js';
import { SUBAGENT_FLAG_USAGE } from '../subagent/parse.js';
import { command } from './subagent.js';
import { commands, findCommand } from './index.js';

const mocks = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock('../subagent/launch.js', async (importOriginal) => {
  const actual = await importOriginal<typeof LaunchModule>();
  return {
    ...actual,
    launchSubagent: (options: SubagentLaunchOptions, managers: Managers) => mocks.launch(options, managers),
  };
});

const roots: string[] = [];
afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
  vi.restoreAllMocks();
  mocks.launch.mockReset();
});

const RECEIPT: Extract<AcpDispatchReceipt, { kind: 'record' }> = {
  replyId: 'reply-1', kind: 'record', recordId: 'record-1', name: 'subagent:Research',
};

function fixture(roles?: Record<string, unknown>) {
  const root = mkdtempSync(path.join(tmpdir(), 'subagent-command-'));
  roots.push(root);
  mkdirSync(path.join(root, '.janissary'), { recursive: true });
  writeFileSync(path.join(root, '.janissary', 'roles.json'), JSON.stringify(roles ?? {
    research: { description: 'ignored', entries: [{ harness: 'opencode', model: 'model-a' }], commands: [] },
  }));
  const label = 'caller';
  const tab = { label, index: 0, view: 'shell' } as Tab;
  tab.runtime = { busy: false, context: [], queue: [] } as TabRuntime;
  const appended: Array<{ input: string; output: string; background?: string }> = [];
  const managers = {
    tab: {
      launchDir: root,
      byLabel: (want: string) => want === label ? tab : undefined,
      append: (want: string, entry: (typeof appended)[number]) => { if (want === label) appended.push(entry); },
    },
    models: { isKnownModel: vi.fn(() => true) },
  } as unknown as Managers;
  return { managers, tab, appended };
}

function invocation(overrides: Partial<CommandInvocationContext> = {}): CommandInvocationContext {
  return {
    runId: 'run-1', invocationId: 'inv-1',
    caller: { label: 'caller', cwd: '/cwd', context: [] },
    signal: new AbortController().signal,
    ...overrides,
  };
}

const FLAGS = 'subagent --role research --task t.md';
const JSON_LINE = 'subagent {"role":"research","task":"t.md"}';

describe('subagent command definition and registry', () => {
  it('declares one registry entry with the exact metadata, samples, and direct helper identities', () => {
    expect(command.name).toBe('subagent');
    expect(command.coreResponse).toBe(true);
    expect(command.available).toBe(acpAvailable);
    expect(command.match).toBe(isSubagentCommandLine);
    expect(command.run).toBe(runSubagentCommand);
    expect(command.samples).toEqual(['subagent', 'subagent --role research --task t.md']);
    expect(commands.filter((entry) => entry.name === 'subagent')).toEqual([command]);
    expect(findCommand('subagent', FLAGS)).toBe(command);
  });

  it.each([
    'subagent',
    FLAGS,
    JSON_LINE,
    'subagent {"role":',
    '  SuBAgEnT\t--role research --task t.md  ',
  ])('routes %s to the subagent command', (line) => {
    expect(command.match(line)).toBe(true);
    expect(findCommand('subagent', line)).toBe(command);
  });

  it.each(['subagents --role r', 'subagent-x --role r'])('leaves %s unclaimed', (line) => {
    expect(command.match(line)).toBe(false);
  });

  it('uses the same availability predicate as ask', () => {
    const ask = commands.find((entry) => entry.name === 'ask');
    expect(ask?.available).toBe(acpAvailable);
    expect(command.available).toBe(ask?.available);
  });
});

describe('subagent command public results', () => {
  it('returns an empty string immediately for an ACP caller and launches once', () => {
    const { managers, tab, appended } = fixture();
    mocks.launch.mockReturnValue(RECEIPT);
    const inv = invocation({ acpTool: true, acpRole: 'tell' });

    expect(command.run(JSON_LINE, tab, managers, inv)).toBe('');
    expect(mocks.launch).toHaveBeenCalledTimes(1);
    expect((mocks.launch.mock.calls[0][0] as SubagentLaunchOptions).invocation).toBe(inv);
    expect(appended).toEqual([]);
  });

  it('returns the record receipt to a human and launches once', () => {
    const { managers, tab, appended } = fixture();
    mocks.launch.mockReturnValue(RECEIPT);

    expect(command.run(FLAGS, tab, managers)).toBe(RECEIPT);
    expect(mocks.launch).toHaveBeenCalledTimes(1);
    expect(appended).toEqual([]);
  });

  it('returns the unknown-role refusal directly to an ACP caller with no launch or reply', () => {
    const { managers, tab, appended } = fixture({ other: { description: '', entries: [], commands: [] } });
    const inv = invocation({ acpTool: true, acpRole: 'ask' });

    expect(command.run('subagent {"role":"nope","task":"t.md"}', tab, managers, inv))
      .toBe('Subagent: unknown role "nope".');
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(appended).toEqual([]);
  });

  it('appends one flag-usage refusal and no marker for malformed human input', () => {
    const { managers, tab, appended } = fixture();
    const line = '  /subagent --bogus x  ';
    const inv = invocation({ line });

    expect(command.run(line, tab, managers, inv)).toBeUndefined();
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(appended).toEqual([{
      input: line, output: SUBAGENT_FLAG_USAGE, background: expect.any(String),
    }]);
  });
});
