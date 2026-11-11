import { afterEach, describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('../browser/command.js', () => ({
  isBrowserCommandLine: vi.fn((line: string) => line.startsWith('browser ')),
  BROWSER_PRIMER: 'browser primer text',
}));
vi.mock('../question-command.js', () => ({
  isQuestionCommandLine: vi.fn((line: string) => line.startsWith('question ask')),
  QUESTION_PRIMER: 'question primer text',
}));
vi.mock('../notifications/index.js', () => ({ notify: vi.fn() }));

import {
  createAcpToolTable, gateCommand, toolPrimer, toolRunner, toolExtractor, type AcpTool,
} from './tool-table.js';
import type { AcpRunSnapshot, AcpRunSnapshotRow } from './types.js';
import { NATIVE_ACP_COMMANDS } from '../plugins/roles/shared.js';
import { NativeCommandSettingsManager } from '../native-commands/manager.js';
import { notify } from '../notifications/index.js';

const settingsRoots: string[] = [];

afterEach(() => {
  for (const root of settingsRoots) rmSync(root, { recursive: true, force: true });
  settingsRoots.length = 0;
  vi.clearAllMocks();
});

function settingsWith(
  values: Record<string, { enabled?: boolean; agentAccess?: boolean }>,
): NativeCommandSettingsManager {
  const root = mkdtempSync(path.join(tmpdir(), 'acp-tool-table-'));
  settingsRoots.push(root);
  const home = path.join(root, 'home');
  mkdirSync(path.join(home, '.janissary'), { recursive: true });
  writeFileSync(path.join(home, '.janissary', 'commands.json'), JSON.stringify(values));
  return new NativeCommandSettingsManager(path.join(root, 'project'), home);
}

const setup = (
  grants: readonly string[] = NATIVE_ACP_COMMANDS,
  settings = settingsWith({}),
  signal?: AbortSignal,
) => {
  const dispatchNativeLine = vi.fn(async () => ({ dispatched: true, output: 'dispatched output' }));
  const isCommandLine = vi.fn((line: string) => line.startsWith('db '));
  const managers = {
    tab: { byLabel: vi.fn(), workingDirOf: vi.fn(() => '/project') },
    browser: { run: vi.fn() },
    questions: { register: vi.fn() },
    database: { primer: 'db primer text', runInTab: vi.fn(), isCommandLine },
    command: { dispatchNativeLine },
    nativeCommandSettings: settings,
  } as never;
  return {
    managers,
    tools: createAcpToolTable(managers, 'ask', grants, signal),
    dispatchNativeLine,
    isCommandLine,
    signal,
  };
};

describe('createAcpToolTable', () => {
  it('keeps the existing table order and appends the canonical allow-list', () => {
    const { tools } = setup();
    expect(toolPrimer(tools, NATIVE_ACP_COMMANDS)).toBe([
      'browser primer text',
      'question primer text',
      'db primer text',
      `Only these commands are allowed: ${NATIVE_ACP_COMMANDS.join(', ')}.`,
    ].join('\n\n'));
  });

  it('filters omitted owners and de-duplicates unknown grants in the allow-list', () => {
    const grants = ['browser goto', 'browser goto', 'unknown command'];
    const { tools } = setup(grants);
    expect(tools).toHaveLength(1);
    expect(toolPrimer(tools, grants)).toBe(
      'browser primer text\n\nOnly these commands are allowed: browser goto.',
    );
    expect(toolExtractor(tools)('question ask x')).toBeNull();
    expect(toolExtractor(tools)('db sqlite list')).toBeNull();
  });

  it('returns no tools or primer when the role has no grants', () => {
    const { tools } = setup([]);
    expect(tools).toEqual([]);
    expect(toolPrimer(tools, [])).toBe('');
    expect(toolExtractor(tools)('browser goto x')).toBeNull();
  });

  it('runs the browser, question, and database entries on the caller side', () => {
    const { tools } = setup();
    expect(tools.map((tool) => tool.runsOn)).toEqual(['caller', 'caller', 'caller']);
  });

  it('keeps the database entry last when it is included', () => {
    const { tools } = setup();
    expect(tools.at(-1)!.match('anything at all')).toBe(true);
    expect(tools.slice(0, -1).some((tool) => tool.match('anything at all'))).toBe(false);
  });

  it('keeps every included group primer while listing only enabled commands', () => {
    const settings = settingsWith({ 'browser goto': { agentAccess: false } });
    const { tools } = setup(['browser goto', 'db sqlite list'], settings);
    expect(toolPrimer(tools, ['db sqlite list'])).toBe([
      'browser primer text',
      'db primer text',
      'Only these commands are allowed: db sqlite list.',
    ].join('\n\n'));
  });

  it.each([
    ['disabled', { enabled: false }],
    ['agent-off', { agentAccess: false }],
  ])('keeps the group primer and extraction for a granted owner whose only command is %s', (_state, setting) => {
    const settings = settingsWith({ 'browser goto': setting });
    const { tools } = setup(['browser goto'], settings);
    expect(tools).toHaveLength(1);
    expect(toolPrimer(tools, [])).toBe('browser primer text');
    expect(toolExtractor(tools)('browser goto x')).toBe('browser goto x');
  });
});

describe('toolRunner', () => {
  it('routes a browser command through the dispatcher with the prompt signal', async () => {
    const controller = new AbortController();
    const { managers, tools, dispatchNativeLine } = setup(NATIVE_ACP_COMMANDS, settingsWith({}), controller.signal);
    await expect(toolRunner(managers, tools, 'ask', NATIVE_ACP_COMMANDS, 'tab1')(
      'browser goto https://example.com',
    )).resolves.toBe('dispatched output');
    expect(dispatchNativeLine).toHaveBeenCalledWith(
      'tab1',
      'browser goto https://example.com',
      expect.objectContaining({ acpTool: true, awaitResult: true, signal: controller.signal }),
    );
  });

  it('routes a question command through the dispatcher', async () => {
    const { managers, tools, dispatchNativeLine } = setup();
    await expect(toolRunner(managers, tools, 'ask', NATIVE_ACP_COMMANDS, 'tab1')(
      'question ask "What port?"',
    )).resolves.toBe('dispatched output');
    expect(dispatchNativeLine).toHaveBeenCalledWith(
      'tab1',
      'question ask "What port?"',
      expect.objectContaining({ acpTool: true, awaitResult: true }),
    );
  });

  it('routes an allowed database command with trailing arguments through the dispatcher', async () => {
    const { managers, tools, dispatchNativeLine } = setup(['db sqlite query']);
    await expect(toolRunner(managers, tools, 'ask', ['db sqlite query'], 'tab1')(
      'db sqlite query shop SELECT 1',
    )).resolves.toBe('dispatched output');
    expect(dispatchNativeLine).toHaveBeenCalledWith(
      'tab1',
      'db sqlite query shop SELECT 1',
      expect.objectContaining({ acpTool: true, awaitResult: true }),
    );
  });

  it('returns the disabled refusal before the role refusal for a disabled ungranted command', () => {
    const settings = settingsWith({ 'browser eval': { enabled: false } });
    const { managers, tools, dispatchNativeLine } = setup(['browser goto'], settings);
    const run = toolRunner(managers, tools, 'Reader', ['browser goto'], 'tab1');
    expect(run('browser eval document.title')).toBe('Command is disabled: browser eval.');
    expect(notify).toHaveBeenCalledWith(
      managers, 'command-disabled', 'tab1', 'Command is disabled: browser eval.',
    );
    expect(dispatchNativeLine).not.toHaveBeenCalled();
  });

  it('returns the same refusal for an agent-off granted command and notifies', () => {
    const settings = settingsWith({ 'browser goto': { enabled: true, agentAccess: false } });
    const { managers, tools, dispatchNativeLine } = setup(NATIVE_ACP_COMMANDS, settings);
    const run = toolRunner(managers, tools, 'ask', NATIVE_ACP_COMMANDS, 'tab1');
    expect(run('browser goto https://example.com')).toBe('Command is disabled: browser goto.');
    expect(notify).toHaveBeenCalledWith(
      managers, 'command-disabled', 'tab1', 'Command is disabled: browser goto.',
    );
    expect(dispatchNativeLine).not.toHaveBeenCalled();
  });

  it('returns the exact role refusal for an enabled but ungranted command', () => {
    const grants = ['browser goto'];
    const { managers, tools, dispatchNativeLine } = setup(grants);
    const command = 'browser eval document.title';
    expect(toolExtractor(tools)(command)).toBe(command);
    expect(toolRunner(managers, tools, 'Reader', grants, 'tab1')(command)).toBe(
      'Command not allowed for role "Reader": browser eval.',
    );
    expect(dispatchNativeLine).not.toHaveBeenCalled();
  });

  it('does not pass an unknown command to the database catch-all', () => {
    const { managers, tools, dispatchNativeLine } = setup();
    expect(() => toolRunner(managers, tools, 'ask', NATIVE_ACP_COMMANDS, 'tab1')('select 1'))
      .toThrow('No ACP tool matched command: select 1');
    expect(dispatchNativeLine).not.toHaveBeenCalled();
  });
});

describe('gateCommand', () => {
  const gateTools: AcpTool[] = [
    {
      primer: 'browser',
      match: (command) => /^browser\b/i.test(command),
      run: () => 'unused',
      isCommandLine: () => false,
      runsOn: 'caller',
    },
    {
      primer: 'db',
      match: (command) => /^db\b/i.test(command),
      run: () => 'unused',
      isCommandLine: () => false,
      runsOn: 'workspace',
    },
  ];

  const core = (overrides: {
    grants?: readonly string[];
    rows?: readonly AcpRunSnapshotRow[];
    roleName?: string;
  } = {}): AcpRunSnapshot => ({
    kind: 'core',
    role: 'ask',
    roleName: overrides.roleName ?? 'ask',
    grants: overrides.grants ?? ['browser goto', 'db sqlite query'],
    rows: overrides.rows ?? [],
    withoutTools: false,
  });

  const dbOff: AcpRunSnapshotRow = { name: 'db sqlite query', effectiveEnabled: false, effectiveAgentAccess: true };

  it('throws for a command with no native name or no claiming tool', () => {
    expect(() => gateCommand(core(), gateTools, 'select 1')).toThrow('No ACP tool matched command: select 1');
    expect(() => gateCommand(core(), gateTools, 'question ask "x"'))
      .toThrow('No ACP tool matched command: question ask "x"');
  });

  it('refuses a disabled command and marks it disabled', () => {
    expect(gateCommand(core({ rows: [dbOff] }), gateTools, 'db sqlite query select 1')).toStrictEqual({
      refusal: 'Command is disabled: db sqlite query.', refused: 'disabled',
    });
  });

  it('refuses an agent-off command with the same text and flag', () => {
    const rows = [{ name: 'db sqlite query', effectiveEnabled: true, effectiveAgentAccess: false }];
    expect(gateCommand(core({ rows }), gateTools, 'db sqlite query select 1')).toStrictEqual({
      refusal: 'Command is disabled: db sqlite query.', refused: 'disabled',
    });
  });

  it('reports the disabled refusal for a disabled ungranted command', () => {
    expect(gateCommand(core({ rows: [dbOff], grants: [] }), gateTools, 'db sqlite query select 1')).toStrictEqual({
      refusal: 'Command is disabled: db sqlite query.', refused: 'disabled',
    });
  });

  it('refuses an enabled ungranted command with the role refusal and no refused key', () => {
    const snapshot = core({ grants: ['db sqlite query'], roleName: 'researcher' });
    expect(gateCommand(snapshot, gateTools, 'browser goto https://x')).toStrictEqual({
      refusal: 'Command not allowed for role "researcher": browser goto.',
    });
  });

  it('allows a granted command with no row and returns the matched tool side', () => {
    expect(gateCommand(core(), gateTools, 'browser goto https://x')).toStrictEqual({ runsOn: 'caller' });
    expect(gateCommand(core(), gateTools, 'db sqlite query select 1')).toStrictEqual({ runsOn: 'workspace' });
  });

  it('allows a granted command whose row is enabled with agent access', () => {
    const rows = [{ name: 'browser goto', effectiveEnabled: true, effectiveAgentAccess: true }];
    expect(gateCommand(core({ rows }), gateTools, 'browser goto https://x')).toStrictEqual({ runsOn: 'caller' });
  });

  it('decides the same way twice from a deep-frozen snapshot', () => {
    const rows = Object.freeze([Object.freeze({ ...dbOff })]);
    const snapshot = Object.freeze(core({ rows, grants: Object.freeze(['browser goto']) }));
    const first = gateCommand(snapshot, gateTools, 'db sqlite query select 1');
    expect(gateCommand(snapshot, gateTools, 'db sqlite query select 1')).toStrictEqual(first);
    expect(gateCommand(snapshot, gateTools, 'browser goto https://x')).toStrictEqual({ runsOn: 'caller' });
  });
});

describe('toolExtractor', () => {
  it('returns the command line a tool recognizes', () => {
    const { tools } = setup();
    expect(toolExtractor(tools)('Let me look.\nbrowser goto x')).toBe('browser goto x');
    expect(toolExtractor(tools)('I need to ask.\nquestion ask x')).toBe('question ask x');
  });

  it('reaches the database entry through its manager predicate', () => {
    const { tools, isCommandLine } = setup();
    expect(toolExtractor(tools)('Checking.\ndb sqlite list')).toBe('db sqlite list');
    expect(isCommandLine).toHaveBeenCalledWith('db sqlite list');
  });

  it('picks the last command line even when an earlier line belongs to a tool listed first', () => {
    const { tools } = setup();
    const reply = 'Earlier I ran:\nbrowser goto x\nNow the data:\ndb sqlite query shop SELECT 1';
    expect(toolExtractor(tools)(reply)).toBe('db sqlite query shop SELECT 1');
  });

  it('picks a trailing browser line over an earlier database line', () => {
    const { tools } = setup();
    expect(toolExtractor(tools)('db sqlite list\nthen\nbrowser goto x')).toBe('browser goto x');
  });

  it('returns a disabled granted command', () => {
    const settings = settingsWith({ 'browser goto': { enabled: false } });
    const { tools } = setup(['browser goto'], settings);
    expect(toolExtractor(tools)('Let me look.\nbrowser goto x')).toBe('browser goto x');
  });

  it('returns null when no line is a command', () => {
    const { tools } = setup();
    expect(toolExtractor(tools)('here is the final answer')).toBeNull();
    expect(toolExtractor(tools)('browser open https://example.com')).toBeNull();
  });
});
