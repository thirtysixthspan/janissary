import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type * as nodeOs from 'node:os';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseFileRead, type FileReadArgs } from '../file-read/command.js';
import { parseFileMutation } from '../file-write/command.js';
import type * as TabWrite from '../file-write/tab-write.js';
import { readWorkspaceLines } from '../file-read/read.js';
import type { Managers } from '../managers.js';
import type { TabRuntime } from '../tab/types.js';
import type { AcpPendingPrompt } from './prompt-state.js';
import type {
  AcpLoopDeps, AcpLoopHandlers, AcpLoopSession, AcpPromptHandlers, AcpRunSnapshot, AcpSession, AcpToolHost,
} from './types.js';
import type { RemoteAcpSession } from '../remote/acp-session.js';
import type { NativeCommandSettingsManager } from '../native-commands/manager.js';
import type { CommandSettingsSnapshot } from '../native-commands/settings-types.js';
import { NATIVE_ACP_COMMANDS } from '../plugins/roles/shared.js';
import { DISABLED_HARNESS_TOOLS_LINE } from './internal-tools.js';
import type * as TabRead from '../file-read/tab-read.js';
import type * as TabGlob from '../file-glob/tab-glob.js';
import type * as TabGrep from '../file-grep/tab-grep.js';
import type * as Loop from './loop.js';
import type * as DriveLoop from './drive-loop.js';
import { MARKDOWN_INSTRUCTION } from './launch.js';
import { BROWSER_PRIMER } from '../browser/command.js';
import { DB_PRIMER } from '../database/primer.js';
import { FILE_GREP_PRIMER, FILE_GREP_USAGE } from '../file-grep/command.js';
import * as fileGrepCandidates from '../file-grep/candidates.js';
import * as fileGrepScan from '../file-grep/scan.js';
import { commandProtocolPrimer } from './command-protocol.js';
import { CORE_MAX_STEPS } from './drive-loop.js';
import { deferred } from '../deferred.js';
import { WEB_SEARCH_PRIMER } from '../web/search/command.js';
import { WEB_FETCH_PRIMER } from '../web/fetch/command.js';
import { CommandManager } from '../command/manager.js';
import { SUBAGENT_JSON_USAGE } from '../subagent/parse.js';
import type * as LaunchModule from '../subagent/launch.js';

const subagentMock = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock('../subagent/launch.js', async (importOriginal) => {
  const actual = await importOriginal<typeof LaunchModule>();
  return { ...actual, launchSubagent: subagentMock.launch };
});

const mocks = vi.hoisted(() => ({
  runAcpToolLoop: vi.fn(), notify: vi.fn(), readFileInTab: vi.fn(), mutateFileInTab: vi.fn(),
  globFilesInTab: vi.fn(), grepFilesInTab: vi.fn(), runWebInTab: vi.fn(), runToolLoop: vi.fn(),
}));
const home = vi.hoisted(() => ({ dir: '' }));

vi.mock('node:os', async (importOriginal) => ({
  ...await importOriginal<typeof nodeOs>(),
  homedir: vi.fn(() => home.dir),
}));
vi.mock('./loop.js', () => ({ runAcpToolLoop: mocks.runAcpToolLoop }));
vi.mock('../notifications/index.js', () => ({ notify: mocks.notify }));
vi.mock('../file-read/tab-read.js', async (importOriginal) => {
  const actual = await importOriginal<typeof TabRead>();
  mocks.readFileInTab.mockImplementation(actual.readFileInTab);
  return { ...actual, readFileInTab: mocks.readFileInTab };
});
vi.mock('../file-write/tab-write.js', async (importOriginal) => {
  const actual = await importOriginal<typeof TabWrite>();
  mocks.mutateFileInTab.mockImplementation(actual.mutateFileInTab);
  return { ...actual, mutateFileInTab: mocks.mutateFileInTab };
});
vi.mock('../file-glob/tab-glob.js', async (importOriginal) => {
  const actual = await importOriginal<typeof TabGlob>();
  mocks.globFilesInTab.mockImplementation(actual.globFilesInTab);
  return { ...actual, globFilesInTab: mocks.globFilesInTab };
});
vi.mock('../file-grep/tab-grep.js', async (importOriginal) => {
  const actual = await importOriginal<typeof TabGrep>();
  mocks.grepFilesInTab.mockImplementation(actual.grepFilesInTab);
  return { ...actual, grepFilesInTab: mocks.grepFilesInTab };
});
vi.mock('../web/tab-web.js', () => ({ runWebInTab: mocks.runWebInTab }));
vi.mock('./drive-loop.js', async (importOriginal) => {
  const actual = await importOriginal<typeof DriveLoop>();
  mocks.runToolLoop.mockImplementation(actual.runToolLoop);
  return { ...actual, runToolLoop: mocks.runToolLoop };
});

import { coreSnapshotRows, runCorePrompt } from './run-prompt.js';

const homeRoots: string[] = [];
const launchRoots: string[] = [];
beforeEach(() => {
  const dir = mkdtempSync(path.join(tmpdir(), 'acp-run-prompt-home-'));
  home.dir = dir;
  homeRoots.push(dir);
});
afterEach(() => {
  for (const dir of homeRoots) rmSync(dir, { recursive: true, force: true });
  homeRoots.length = 0;
  for (const dir of launchRoots) rmSync(dir, { recursive: true, force: true });
  launchRoots.length = 0;
  subagentMock.launch.mockReset();
});

function subagentLaunchDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'acp-run-prompt-subagent-'));
  launchRoots.push(dir);
  mkdirSync(path.join(dir, '.janissary'));
  writeFileSync(path.join(dir, '.janissary', 'roles.json'), JSON.stringify({
    research: {
      description: 'Research.',
      entries: [{ harness: 'opencode', model: 'model-a' }],
      commands: ['subagent'],
    },
  }));
  return dir;
}

const TELL_INSTRUCTION = 'The user is instructing you to carry out a task. Do it with the commands available to you, then briefly report what you did.';
const NO_BUILTIN_TOOLS_LINE = 'You have no built-in tools; use only the commands listed here.';
const NO_TOOLS_LINE = 'You have no tools; answer in prose.';

type SettingRows = Record<string, { effectiveEnabled?: boolean; effectiveAgentAccess?: boolean }>;

// A settings stub whose rows can change between prompts or mid-prompt.
function mutableSettings(initial: SettingRows) {
  let rows = initial;
  const current = vi.fn(() => ({
    commands: Object.entries(rows).map(([name, values]) => ({
      name,
      effectiveEnabled: values.effectiveEnabled ?? true,
      effectiveAgentAccess: values.effectiveAgentAccess ?? true,
    })),
    source: 'default',
    path: '',
  }));
  return {
    manager: { current } as unknown as NativeCommandSettingsManager,
    current,
    set: (next: SettingRows) => { rows = next; },
  };
}

function settingsWith(rows: SettingRows): NativeCommandSettingsManager {
  return mutableSettings(rows).manager;
}

type StartOptions = {
  withoutTools?: boolean;
  commands?: string[];
  roleName?: string;
  settings?: NativeCommandSettingsManager;
  tab?: { workspaceDir?: string; remote?: unknown };
  launchDir?: string;
  remoteSession?: boolean;
  realCommand?: boolean;
};

function harness(options: Omit<StartOptions, 'commands' | 'roleName'> = {}) {
  const dispatchNativeLine = vi.fn(async () => ({ dispatched: true, output: 'dispatched output' }));
  const runtime = { acpWithoutTools: options.withoutTools ?? false, acpRoles: {} } as unknown as TabRuntime;
  const tab = {
    runtime,
    ...(options.realCommand && { view: 'plugin', plugin: { id: 'shell' } }),
    ...options.tab,
    cmdHistory: ['git status'], cmdHistoryIdx: -1,
  };
  const managers = {
    tab: {
      updateRunning: vi.fn(),
      deleteBusy: vi.fn(),
      append: vi.fn(),
      byLabel: vi.fn(() => tab),
      ...(options.realCommand && { findIndex: vi.fn(() => 0), tabs: [tab] }),
      workingDirOf: vi.fn(() => '/project'),
      launchDir: options.launchDir ?? '/launch',
    },
    acpRecords: { activity: vi.fn(), answer: vi.fn() },
    command: { dispatchNativeLine },
    ...(options.realCommand && {
      plugins: { declarations: [{ id: 'shell', capabilities: ['promptAcp'] }] },
      models: { isKnownModel: vi.fn(() => true) },
      agent: { runs: new Map(), trackCreatedTab: vi.fn() },
    }),
    ...(options.settings && { nativeCommandSettings: options.settings }),
  } as unknown as Managers;
  if (options.realCommand) managers.command = new CommandManager(managers);
  const providerPrompt = vi.fn();
  const run = vi.fn();
  const localSession = { prompt: providerPrompt } as unknown as AcpSession;
  const remoteSession: RemoteAcpSession = {
    remote: true, run, ready: Promise.resolve(true), release: async () => true,
    cancel: async () => {}, kill: () => {}, shutdown: async () => {},
  };
  const session: AcpSession | RemoteAcpSession = options.remoteSession ? remoteSession : localSession;
  const start = (
    role: 'ask' | 'tell' = 'ask', commands: string[] = ['db sqlite query'], roleName: string = role,
    recordId?: string, aborted = false,
  ) => {
    const request: AcpPendingPrompt = {
      finish: vi.fn(), abort: new AbortController(), prompt: 'instructions', role,
      roleName, commands, runningEntries: new Set(), ...(recordId !== undefined && { recordId }),
    };
    (runtime as unknown as { acpRoles: Record<string, unknown> }).acpRoles[role] = {
      prompt: request, ...(recordId !== undefined && { recordId }),
    };
    mocks.runAcpToolLoop.mockClear();
    mocks.runToolLoop.mockClear();
    if (aborted) request.abort.abort();
    const nativeSettings = options.settings?.current();
    runCorePrompt(managers, 'shell', runtime, request, nativeSettings, session, 'session', () => true);
    const call = mocks.runAcpToolLoop.mock.calls.at(-1);
    const deps = call?.[2] as AcpLoopDeps;
    const handlers = call?.[3] as AcpLoopHandlers;
    const loopSession = call?.[0] as AcpLoopSession;
    const host = mocks.runToolLoop.mock.calls.at(-1)?.[3] as AcpToolHost;
    return { deps, request, handlers, session: loopSession, host, run };
  };
  return { managers, dispatchNativeLine, providerPrompt, start, run, tab };
}

async function withRealLoop(run: () => Promise<void>): Promise<void> {
  const actual = await vi.importActual<typeof Loop>('./loop.js');
  await mocks.runAcpToolLoop.withImplementation(actual.runAcpToolLoop, run);
}

function latestPrompt(providerPrompt: ReturnType<typeof vi.fn>): AcpPromptHandlers {
  return providerPrompt.mock.calls.at(-1)![1] as AcpPromptHandlers;
}

function reply(providerPrompt: ReturnType<typeof vi.fn>, text: string): void {
  const handlers = latestPrompt(providerPrompt);
  handlers.onChunk(text);
  handlers.onEnd('end_turn');
}

type RemoteCall = [string, AcpRunSnapshot, AcpToolHost['runCaller'], AcpLoopHandlers];

function remoteCall(run: ReturnType<typeof vi.fn>): RemoteCall {
  return run.mock.calls[0] as RemoteCall;
}

function primer(role: 'ask' | 'tell', options: StartOptions = {}): string {
  return harness(options).start(role, options.commands, options.roleName).deps.primer;
}

describe('runCorePrompt role primer', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('places the tell instruction after available tool text and the protocol, before Markdown', () => {
    expect(primer('tell')).toBe([
      DB_PRIMER,
      'Only these commands are allowed: db sqlite query.',
      NO_BUILTIN_TOOLS_LINE,
      DISABLED_HARNESS_TOOLS_LINE,
      commandProtocolPrimer(CORE_MAX_STEPS),
      TELL_INSTRUCTION,
      MARKDOWN_INSTRUCTION,
    ].join('\n\n'));
  });

  it('does not give the ask role the tell instruction', () => {
    const result = primer('ask');
    expect(result).not.toContain(TELL_INSTRUCTION);
    expect(result.startsWith(DB_PRIMER)).toBe(true);
    expect(result.endsWith(MARKDOWN_INSTRUCTION)).toBe(true);
  });

  it('keeps the tell instruction when the tab-wide no-tools override removes tool text', () => {
    expect(primer('tell', { withoutTools: true }))
      .toBe([NO_TOOLS_LINE, TELL_INSTRUCTION, MARKDOWN_INSTRUCTION].join('\n\n'));
  });

  it('omits the tell instruction from ask when the tab-wide no-tools override is set', () => {
    const result = primer('ask', { withoutTools: true });
    expect(result).toBe([NO_TOOLS_LINE, MARKDOWN_INSTRUCTION].join('\n\n'));
    expect(result).not.toContain(TELL_INSTRUCTION);
  });

  it('starts the primer with the no-tools line for a role with no grants', () => {
    expect(primer('ask', { commands: [] })).toBe([NO_TOOLS_LINE, MARKDOWN_INSTRUCTION].join('\n\n'));
  });

  it('excludes an agent-off command from the allow-list but keeps its owner primer', () => {
    const result = primer('ask', {
      commands: ['browser goto', 'db sqlite query'],
      settings: settingsWith({ 'browser goto': { effectiveAgentAccess: false } }),
    });
    expect(result).toContain(BROWSER_PRIMER);
    expect(result).toContain(DB_PRIMER);
    expect(result).toContain('Only these commands are allowed: db sqlite query.');
    expect(result).not.toContain('browser goto,');
    expect(result).toContain(NO_BUILTIN_TOOLS_LINE);
    expect(result).not.toContain(NO_TOOLS_LINE);
  });

  it('keeps the grep owner and primer while an agent-off grep leaves the no-tools line', () => {
    const result = primer('ask', {
      commands: ['file grep'],
      settings: settingsWith({ 'file grep': { effectiveAgentAccess: false } }),
    });
    expect(result).toBe([FILE_GREP_PRIMER, NO_TOOLS_LINE, MARKDOWN_INSTRUCTION].join('\n\n'));
    expect(result).not.toContain('Only these commands are allowed');
    expect(result).not.toContain(NO_BUILTIN_TOOLS_LINE);
  });

  it.each([
    ['disabled', { effectiveEnabled: false, effectiveAgentAccess: false }],
    ['agent-off', { effectiveEnabled: true, effectiveAgentAccess: false }],
  ])('keeps the group primer alone when the %s intersection is empty', (_state, setting) => {
    const result = primer('ask', {
      commands: ['browser goto'],
      settings: settingsWith({ 'browser goto': setting }),
    });
    expect(result).toBe([BROWSER_PRIMER, NO_TOOLS_LINE, MARKDOWN_INSTRUCTION].join('\n\n'));
    expect(result).not.toContain('Only these commands are allowed');
  });

  it('keeps the tell instruction after a filtered allow-list', () => {
    const result = primer('tell', {
      commands: ['browser goto', 'db sqlite query'],
      settings: settingsWith({ 'browser goto': { effectiveAgentAccess: false } }),
    });
    const allowList = result.indexOf('Only these commands are allowed: db sqlite query.');
    expect(result.indexOf(BROWSER_PRIMER)).toBeLessThan(allowList);
    expect(allowList).toBeLessThan(result.indexOf(NO_BUILTIN_TOOLS_LINE));
    expect(result.indexOf(NO_BUILTIN_TOOLS_LINE)).toBeLessThan(result.indexOf(DISABLED_HARNESS_TOOLS_LINE));
    expect(result.indexOf(DISABLED_HARNESS_TOOLS_LINE)).toBeLessThan(result.indexOf('How commands work:'));
    expect(result.indexOf('How commands work:')).toBeLessThan(result.indexOf(TELL_INSTRUCTION));
    expect(result.indexOf(TELL_INSTRUCTION)).toBeLessThan(result.indexOf(MARKDOWN_INSTRUCTION));
  });
});

describe('runCorePrompt tool runner', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it.each(['ask', 'tell'] as const)(
    'dispatches a granted caller-side command with the %s role and prompt signal',
    async (role) => {
      const { start, dispatchNativeLine } = harness({ settings: settingsWith({}) });
      const { deps, request } = start(role, ['db sqlite query'], 'display name');
      await expect(deps.runCommand('db sqlite query shop SELECT 1')).resolves.toBe('dispatched output');
      expect(dispatchNativeLine).toHaveBeenCalledWith(
        'shell',
        'db sqlite query shop SELECT 1',
        expect.objectContaining({
          acpRole: role, acpTool: true, awaitResult: true, signal: request.abort.signal,
        }),
      );
    },
  );

  it.each([
    ['disabled', { effectiveEnabled: false }],
    ['agent-off', { effectiveAgentAccess: false }],
  ])('refuses a %s command synchronously and raises the disabled notification', (_state, setting) => {
    const { start, managers, dispatchNativeLine } = harness({ settings: settingsWith({ 'db sqlite query': setting }) });
    const { deps, handlers } = start('ask', ['db sqlite query']);
    const command = 'db sqlite query shop SELECT 1';
    const refusal = deps.runCommand(command);
    expect(refusal).toBe('Command is disabled: db sqlite query.');
    expect(mocks.notify).not.toHaveBeenCalledWith(expect.anything(), 'command-disabled', expect.anything(), expect.anything());
    handlers.ranCommand(command, refusal as string);
    expect(mocks.notify).toHaveBeenCalledWith(
      managers, 'command-disabled', 'shell', 'Command is disabled: db sqlite query.',
    );
    expect(dispatchNativeLine).not.toHaveBeenCalled();
  });

  it('runs a granted web search through the tab search with the prompt signal', async () => {
    mocks.runWebInTab.mockResolvedValue('search results');
    const { start, dispatchNativeLine, managers } = harness({ settings: settingsWith({}) });
    const { deps, request } = start('ask', ['web search']);
    await expect(deps.runCommand('web search x')).resolves.toBe('search results');
    expect(mocks.runWebInTab).toHaveBeenCalledWith(managers, 'shell', 'web search x', request.abort.signal);
    expect(dispatchNativeLine).not.toHaveBeenCalled();
    expect(mocks.readFileInTab).not.toHaveBeenCalled();
    expect(deps.primer).toContain(WEB_SEARCH_PRIMER);
    expect(deps.primer).toContain('Only these commands are allowed: web search.');
  });

  it('treats a web search line as prose when the role does not grant it', () => {
    const { start } = harness({ settings: settingsWith({}) });
    const { deps } = start('ask', ['file read']);
    expect(deps.extractCommand('web search x')).toBeNull();
    expect(mocks.runWebInTab).not.toHaveBeenCalled();
  });

  it('refuses a disabled web search synchronously and raises the disabled notification', () => {
    const { start, managers } = harness({ settings: settingsWith({ 'web search': { effectiveEnabled: false } }) });
    const { deps, handlers } = start('ask', ['web search']);
    const command = 'web search x';
    const refusal = deps.runCommand(command);
    expect(refusal).toBe('Command is disabled: web search.');
    expect(mocks.notify).not.toHaveBeenCalledWith(expect.anything(), 'command-disabled', expect.anything(), expect.anything());
    handlers.ranCommand(command, refusal as string);
    expect(mocks.notify).toHaveBeenCalledWith(managers, 'command-disabled', 'shell', 'Command is disabled: web search.');
    expect(mocks.runWebInTab).not.toHaveBeenCalled();
  });

  it('runs a granted web fetch through the tab runner with the prompt signal', async () => {
    mocks.runWebInTab.mockResolvedValue('the page');
    const { start, dispatchNativeLine, managers } = harness({ settings: settingsWith({}) });
    const { deps, request } = start('ask', ['web fetch']);
    await expect(deps.runCommand('web fetch https://x')).resolves.toBe('the page');
    expect(mocks.runWebInTab).toHaveBeenCalledWith(managers, 'shell', 'web fetch https://x', request.abort.signal);
    expect(dispatchNativeLine).not.toHaveBeenCalled();
    expect(deps.primer).toContain(WEB_FETCH_PRIMER);
    expect(deps.primer).toContain('Only these commands are allowed: web fetch.');
    expect(deps.primer).not.toContain(WEB_SEARCH_PRIMER);
  });

  it('treats a web fetch line as prose when the role does not grant it', () => {
    const { start } = harness({ settings: settingsWith({}) });
    const { deps } = start('ask', ['file read']);
    expect(deps.extractCommand('web fetch https://x')).toBeNull();
    expect(mocks.runWebInTab).not.toHaveBeenCalled();
  });

  it('refuses a disabled web fetch synchronously without calling the tab runner', () => {
    const { start } = harness({ settings: settingsWith({ 'web fetch': { effectiveEnabled: false } }) });
    const { deps } = start('ask', ['web fetch']);
    expect(deps.runCommand('web fetch https://x')).toBe('Command is disabled: web fetch.');
    expect(mocks.runWebInTab).not.toHaveBeenCalled();
  });

  it('caps the loop at eight tool steps', () => {
    const { start } = harness();
    expect(start('ask', ['db sqlite query']).deps.maxSteps).toBe(8);
  });

  it('records the command and its result, and appends the result entry', async () => {
    const { start, managers } = harness({ settings: settingsWith({}) });
    const { deps, handlers } = start('ask', ['db sqlite query'], 'ask', 'record-1');
    const command = 'db sqlite query shop SELECT 1';
    const result = await deps.runCommand(command);
    expect(managers.acpRecords.activity).toHaveBeenCalledTimes(1);
    expect(managers.acpRecords.activity).toHaveBeenCalledWith('record-1', 'tool', command);
    handlers.ranCommand(command, result);
    expect(managers.acpRecords.activity).toHaveBeenLastCalledWith('record-1', 'tool', 'dispatched output');
    expect(managers.tab.append).toHaveBeenCalledWith('shell', { input: command, output: 'dispatched output', acp: true });
  });

  it('runs, records, and settles nothing after the prompt is aborted', () => {
    const { start, managers, dispatchNativeLine } = harness({ settings: settingsWith({}) });
    const { deps, handlers, request } = start('ask', ['db sqlite query'], 'ask', 'record-1');
    request.abort.abort();
    expect(() => deps.runCommand('db sqlite query shop SELECT 1')).toThrow('ACP: prompt cancelled.');
    expect(dispatchNativeLine).not.toHaveBeenCalled();
    handlers.ranCommand('db sqlite query shop SELECT 1', 'late');
    handlers.finished('answered', 8);
    expect(managers.acpRecords.activity).not.toHaveBeenCalled();
    expect(managers.tab.append).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalledWith(expect.anything(), 'state-change', expect.anything());
  });

  it('drops a provider error that arrives after the abort', () => {
    const { start, providerPrompt } = harness();
    const { session, request } = start('ask', ['db sqlite query']);
    const spyHandlers: AcpPromptHandlers = { onChunk: vi.fn(), onEnd: vi.fn(), onError: vi.fn() };
    session.prompt('hello', spyHandlers);
    const forwarded = providerPrompt.mock.calls.at(-1)?.[1] as AcpPromptHandlers;
    request.abort.abort();
    forwarded.onError('late failure');
    expect(spyHandlers.onError).not.toHaveBeenCalled();
  });

  it('returns the role refusal for an ungranted enabled command without a notification', () => {
    const { start, dispatchNativeLine } = harness({ settings: settingsWith({}) });
    const { deps } = start('ask', ['browser goto'], 'Reader');
    expect(deps.runCommand('browser eval document.title')).toBe('Command not allowed for role "Reader": browser eval.');
    expect(mocks.notify).not.toHaveBeenCalledWith(expect.anything(), 'command-disabled', expect.anything(), expect.anything());
    expect(dispatchNativeLine).not.toHaveBeenCalled();
  });

  it('throws for a command no tool claims', () => {
    const { start, dispatchNativeLine } = harness();
    const { deps } = start('ask', ['db sqlite query']);
    expect(() => deps.runCommand('select 1')).toThrow('No ACP tool matched command: select 1');
    expect(dispatchNativeLine).not.toHaveBeenCalled();
  });

  it('applies an agent-access change from the next prompt, not mid-prompt', async () => {
    const settings = mutableSettings({ 'db sqlite query': { effectiveAgentAccess: true } });
    const { start, dispatchNativeLine } = harness({ settings: settings.manager });
    const first = start('ask', ['db sqlite query']);
    settings.set({ 'db sqlite query': { effectiveAgentAccess: false } });
    await expect(first.deps.runCommand('db sqlite query shop SELECT 1')).resolves.toBe('dispatched output');
    expect(dispatchNativeLine).toHaveBeenCalledTimes(1);

    const next = start('ask', ['db sqlite query']);
    expect(next.deps.runCommand('db sqlite query shop SELECT 1')).toBe('Command is disabled: db sqlite query.');
    expect(next.deps.primer).not.toContain('Only these commands are allowed: db sqlite query.');
    expect(dispatchNativeLine).toHaveBeenCalledTimes(1);
  });

  it('passes a mid-prompt disabled caller-side command to the dispatcher, whose live guard refuses it', async () => {
    const settings = mutableSettings({ 'browser goto': { effectiveEnabled: true } });
    const { start, dispatchNativeLine } = harness({ settings: settings.manager });
    const { deps } = start('ask', ['browser goto']);
    settings.set({ 'browser goto': { effectiveEnabled: false } });
    await deps.runCommand('browser goto https://x');
    expect(dispatchNativeLine).toHaveBeenCalledWith('shell', 'browser goto https://x', expect.anything());
  });

  it('keeps the settings captured when the prompt starts for every command it runs', async () => {
    const settings = mutableSettings({});
    const { start } = harness({ settings: settings.manager });
    const { deps } = start('ask', ['db sqlite query', 'db sqlite list']);
    await deps.runCommand('db sqlite query shop SELECT 1');
    await deps.runCommand('db sqlite list');
    await deps.runCommand('db sqlite query shop SELECT 2');
    expect(settings.current).toHaveBeenCalledTimes(1);
  });

  it('runs a granted command and lists it when no settings manager exists', async () => {
    const { start, dispatchNativeLine } = harness();
    const { deps } = start('ask', ['db sqlite query']);
    expect(deps.primer).toContain('Only these commands are allowed: db sqlite query.');
    await expect(deps.runCommand('db sqlite query shop SELECT 1')).resolves.toBe('dispatched output');
    expect(dispatchNativeLine).toHaveBeenCalledTimes(1);
  });

  describe('file read', () => {
    let dir: string;
    beforeEach(() => {
      dir = mkdtempSync(path.join(tmpdir(), 'acp-run-prompt-'));
      writeFileSync(path.join(dir, 'a.txt'), 'alpha\nbeta\n');
    });
    afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

    const expected = () => readWorkspaceLines(dir, parseFileRead('file read a.txt') as FileReadArgs);

    it('reads a granted file from the tab workspace without the dispatcher', async () => {
      const { start, dispatchNativeLine } = harness({ tab: { workspaceDir: dir } });
      const { deps } = start('ask', ['file read']);
      await expect(deps.runCommand('file read a.txt')).resolves.toBe(expected());
      expect(expected()).toContain('alpha');
      expect(dispatchNativeLine).not.toHaveBeenCalled();
    });

    it('reads from the launch directory when the tab has no workspace', async () => {
      const { start, dispatchNativeLine } = harness({ tab: {}, launchDir: dir });
      const { deps } = start('ask', ['file read']);
      await expect(deps.runCommand('file read a.txt')).resolves.toBe(expected());
      expect(dispatchNativeLine).not.toHaveBeenCalled();
    });

    it('leaves a remote tab\'s workspace read to the far side, never the local disk', () => {
      const { start, dispatchNativeLine, run } = harness({
        remoteSession: true, tab: { workspaceDir: dir, remote: { host: 'far' } }, launchDir: dir,
      });
      mocks.readFileInTab.mockClear();
      start('ask', ['file read']);
      const call = remoteCall(run);
      const runCaller = call[2];
      const events = call[3];

      events.startCommand?.('file read a.txt', true);
      events.ranCommand('file read a.txt', '1\talpha', true);

      expect(run).toHaveBeenCalledOnce();
      expect(typeof runCaller).toBe('function');
      expect(mocks.readFileInTab).not.toHaveBeenCalled();
      expect(mocks.runAcpToolLoop).not.toHaveBeenCalled();
      expect(dispatchNativeLine).not.toHaveBeenCalled();
    });

    it('tags a remote tab\'s workspace step with the host on the transcript and record lines', () => {
      const { start, managers, run } = harness({
        remoteSession: true, tab: { workspaceDir: dir, remote: { host: 'far' } }, launchDir: dir,
      });
      start('ask', ['file read'], 'ask', 'record-1');
      const events = remoteCall(run)[3];

      events.startCommand?.('file read a.txt', true);
      events.ranCommand('file read a.txt', '1\talpha', true);

      expect(managers.acpRecords.activity).toHaveBeenNthCalledWith(1, 'record-1', 'tool', '[far] file read a.txt');
      expect(managers.acpRecords.activity).toHaveBeenNthCalledWith(2, 'record-1', 'tool', '[far] 1\talpha');
      expect(managers.tab.append).toHaveBeenCalledWith('shell', {
        input: '[far] file read a.txt', output: '1\talpha', acp: true,
      });
    });

    it('leaves a local tab\'s workspace step untagged', async () => {
      const { start, managers } = harness({ tab: { workspaceDir: dir } });
      const { deps, handlers } = start('ask', ['file read'], 'ask', 'record-1');
      const command = 'file read a.txt';
      const result = await deps.runCommand(command);
      handlers.ranCommand(command, result);

      expect(managers.acpRecords.activity).toHaveBeenNthCalledWith(1, 'record-1', 'tool', command);
      expect(managers.acpRecords.activity).toHaveBeenNthCalledWith(2, 'record-1', 'tool', result);
      expect(managers.tab.append).toHaveBeenCalledWith('shell', { input: command, output: result, acp: true });
    });

    it('leaves a remote tab\'s fallback local workspace step untagged', async () => {
      const { start, managers } = harness({ tab: { workspaceDir: dir, remote: { host: 'far' } } });
      const { deps, handlers } = start('ask', ['file read'], 'ask', 'record-1');
      const command = 'file read a.txt';
      const result = await deps.runCommand(command);
      handlers.ranCommand(command, result);

      expect(managers.acpRecords.activity).toHaveBeenNthCalledWith(1, 'record-1', 'tool', command);
      expect(managers.acpRecords.activity).toHaveBeenNthCalledWith(2, 'record-1', 'tool', result);
      expect(managers.tab.append).toHaveBeenCalledWith('shell', { input: command, output: result, acp: true });
    });

    it('refuses an ungranted file read with the role refusal', () => {
      const { start } = harness({ tab: { workspaceDir: dir } });
      const { deps } = start('ask', ['db sqlite query'], 'Reader');
      expect(deps.runCommand('file read a.txt')).toBe('Command not allowed for role "Reader": file read.');
    });
  });

  it('builds no tools on a without-tools tab', () => {
    const { start } = harness({ withoutTools: true });
    const { deps } = start('ask', ['db sqlite query']);
    expect(deps.extractCommand('Checking.\ndb sqlite query shop SELECT 1')).toBeNull();
    expect(deps.primer.startsWith(NO_TOOLS_LINE)).toBe(true);
  });
});

describe('runCorePrompt native result mapping', () => {
  const COMMAND = 'db sqlite query shop SELECT 1';
  const OUTPUT = 'captured output';
  const fallback = Symbol('fallback');
  type NativeReply = { dispatched: boolean; output: string; coreResponse?: boolean; result?: unknown };
  const cases: Array<[string, NativeReply, string]> = [
    [
      'returns a core-response refusal string verbatim',
      { dispatched: true, output: OUTPUT, coreResponse: true, result: 'Command refused.' },
      'Command refused.',
    ],
    [
      'keeps an empty core-response string empty despite captured output',
      { dispatched: true, output: OUTPUT, coreResponse: true, result: '' },
      '',
    ],
    [
      'returns captured output for a core response with an object receipt',
      { dispatched: true, output: OUTPUT, coreResponse: true, result: { receipt: 'ignored' } },
      OUTPUT,
    ],
    [
      'returns captured output for a core response with no result',
      { dispatched: true, output: OUTPUT, coreResponse: true },
      OUTPUT,
    ],
    [
      'returns an ordinary string result before captured output',
      { dispatched: true, output: OUTPUT, result: 'ordinary string result' },
      'ordinary string result',
    ],
    [
      'returns captured output for an ordinary response with no result',
      { dispatched: true, output: OUTPUT },
      OUTPUT,
    ],
    [
      'serializes an ordinary structured result',
      { dispatched: true, output: OUTPUT, result: { status: 'completed' } },
      JSON.stringify({ status: 'completed' }),
    ],
    [
      'falls back to String when JSON serialization is undefined',
      { dispatched: true, output: OUTPUT, result: fallback },
      String(fallback),
    ],
  ];

  beforeEach(() => { vi.clearAllMocks(); });

  it.each(cases)('%s', async (_label, reply, expected) => {
    const { start, dispatchNativeLine } = harness({ settings: settingsWith({}) });
    dispatchNativeLine.mockResolvedValueOnce(reply);
    const { deps } = start('ask', ['db sqlite query']);
    await expect(deps.runCommand(COMMAND)).resolves.toBe(expected);
  });

  it('rejects an undispatched reply carrying a string result before mapping it', async () => {
    const { start, dispatchNativeLine } = harness({ settings: settingsWith({}) });
    dispatchNativeLine.mockResolvedValueOnce({ dispatched: false, output: OUTPUT, result: 'mapped refusal' });
    const { deps } = start('ask', ['db sqlite query']);
    await expect(deps.runCommand(COMMAND)).rejects.toThrow(`No ACP tool matched command: ${COMMAND}`);
  });
});

describe('runCorePrompt remote session', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('hands the prompt, role snapshot, caller runner, and guarded events to the far side', () => {
    const { start, run } = harness({ remoteSession: true });
    const { request } = start('ask', ['db sqlite query']);
    const [text, snapshot, runCaller, events] = remoteCall(run);

    expect(text).toBe('instructions');
    expect(snapshot).toMatchObject({
      kind: 'core', role: 'ask', roleName: 'ask', grants: ['db sqlite query'],
    });
    expect(typeof runCaller).toBe('function');
    expect(typeof events.finished).toBe('function');
    expect(mocks.runAcpToolLoop).not.toHaveBeenCalled();
    expect(request.abort.signal.aborted).toBe(false);
  });

  it.each(['ask', 'tell'] as const)(
    'dispatches a granted caller command through the guarded runner with the %s role',
    async (role) => {
      const { start, dispatchNativeLine, run } = harness({ remoteSession: true });
      const { request } = start(role, ['db sqlite query'], 'display name');
      const runCaller = remoteCall(run)[2];

      await expect(runCaller('db sqlite query shop SELECT 1')).resolves.toBe('dispatched output');
      expect(dispatchNativeLine).toHaveBeenCalledWith(
        'shell',
        'db sqlite query shop SELECT 1',
        expect.objectContaining({
          acpRole: role, acpTool: true, awaitResult: true, signal: request.abort.signal,
        }),
      );
    },
  );

  it('raises the command-disabled notification for a far-side refused step', () => {
    const { start, managers, run } = harness({ remoteSession: true });
    start('ask', ['db sqlite query']);
    const events = remoteCall(run)[3];
    const refusal = 'Command is disabled: db sqlite query.';

    events.ranCommand('db sqlite query shop SELECT 1', refusal, false, 'disabled');

    expect(mocks.notify).toHaveBeenCalledWith(managers, 'command-disabled', 'shell', refusal);
  });

  it('leaves a remote tab\'s caller-side step untagged', () => {
    const { start, managers, run } = harness({ remoteSession: true, tab: { remote: { host: 'far' } } });
    start('ask', ['db sqlite query'], 'ask', 'record-1');
    const events = remoteCall(run)[3];
    const command = 'db sqlite query shop SELECT 1';

    events.startCommand?.(command, false);
    events.ranCommand(command, 'dispatched output', false);

    expect(managers.acpRecords.activity).toHaveBeenNthCalledWith(1, 'record-1', 'tool', command);
    expect(managers.acpRecords.activity).toHaveBeenNthCalledWith(2, 'record-1', 'tool', 'dispatched output');
    expect(managers.tab.append).toHaveBeenCalledWith('shell', {
      input: command, output: 'dispatched output', acp: true,
    });
  });

  it('leaves a remote tab\'s refused step untagged', () => {
    const { start, managers, run } = harness({ remoteSession: true, tab: { remote: { host: 'far' } } });
    start('ask', ['db sqlite query'], 'ask', 'record-1');
    const events = remoteCall(run)[3];
    const command = 'db sqlite query shop SELECT 1';
    const refusal = 'Command is disabled: db sqlite query.';

    events.startCommand?.(command, false);
    events.ranCommand(command, refusal, false, 'disabled');

    expect(managers.acpRecords.activity).toHaveBeenNthCalledWith(1, 'record-1', 'tool', command);
    expect(managers.acpRecords.activity).toHaveBeenNthCalledWith(2, 'record-1', 'tool', refusal);
    expect(managers.tab.append).toHaveBeenCalledWith('shell', { input: command, output: refusal, acp: true });
  });

  it('appends the capped paragraph to a far-side capped answer', () => {
    const { start, run } = harness({ remoteSession: true });
    const { request } = start('ask', ['db sqlite query']);
    const events = remoteCall(run)[3];

    events.endTurn('partial');
    events.finished('capped', 8);

    expect(request.finish).toHaveBeenCalledWith({
      answered: true, reply: 'partial\n\n(stopped after 8 tool steps)', session: 'session',
    });
  });

  it('sends no run when the request is already aborted', () => {
    const { start, run } = harness({ remoteSession: true });
    start('ask', ['db sqlite query'], 'ask', undefined, true);

    expect(run).not.toHaveBeenCalled();
  });
});

describe('runCorePrompt grep recording', () => {
  let dir: string;
  beforeEach(() => {
    vi.clearAllMocks();
    dir = mkdtempSync(path.join(tmpdir(), 'acp-run-prompt-grep-record-'));
    writeFileSync(path.join(dir, 'a.txt'), 'TODO\n');
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const GREP = 'file grep TODO';
  const RESULT = 'a.txt:1: TODO';
  const GRANTS = ['file read', 'file glob', 'file grep', 'file write', 'file edit'];

  it('records a local grep step untagged and leaves command history unchanged', async () => {
    const { start, managers, tab } = harness({ tab: { workspaceDir: dir } });
    const { deps, handlers } = start('tell', GRANTS, 'tell', 'record-1');
    const result = await deps.runCommand(GREP);
    handlers.ranCommand(GREP, result);

    expect(managers.acpRecords.activity).toHaveBeenNthCalledWith(1, 'record-1', 'tool', GREP);
    expect(managers.acpRecords.activity).toHaveBeenNthCalledWith(2, 'record-1', 'tool', result);
    expect(managers.tab.append).toHaveBeenCalledWith('shell', { input: GREP, output: result, acp: true });
    expect(tab.cmdHistory).toEqual(['git status']);
  });

  it('tags both activity lines and the transcript input while leaving the output raw on a remote session', () => {
    const { start, managers, run } = harness({
      remoteSession: true, tab: { workspaceDir: dir, remote: { host: 'far' } }, launchDir: dir,
    });
    start('tell', GRANTS, 'tell', 'record-1');
    const events = remoteCall(run)[3];

    events.startCommand?.(GREP, true);
    events.ranCommand(GREP, RESULT, true);

    expect(managers.acpRecords.activity).toHaveBeenNthCalledWith(1, 'record-1', 'tool', `[far] ${GREP}`);
    expect(managers.acpRecords.activity).toHaveBeenNthCalledWith(2, 'record-1', 'tool', `[far] ${RESULT}`);
    expect(managers.tab.append).toHaveBeenCalledWith('shell', {
      input: `[far] ${GREP}`, output: RESULT, acp: true,
    });
  });

  it('leaves a local fallback session on a remote tab untagged and searches no local disk', async () => {
    const { start, managers } = harness({
      tab: { workspaceDir: dir, remote: { host: 'far' } }, launchDir: dir,
    });
    const { deps, handlers } = start('tell', GRANTS, 'tell', 'record-1');
    const result = await deps.runCommand(GREP);
    handlers.ranCommand(GREP, result);

    expect(result).toBe('Remote connection unavailable.');
    expect(result).not.toContain('a.txt');
    expect(managers.acpRecords.activity).toHaveBeenNthCalledWith(1, 'record-1', 'tool', GREP);
    expect(managers.acpRecords.activity).toHaveBeenNthCalledWith(2, 'record-1', 'tool', result);
    expect(managers.tab.append).toHaveBeenCalledWith('shell', { input: GREP, output: result, acp: true });
  });

  it('leaves a remote caller-side step untagged', () => {
    const { start, managers, run } = harness({ remoteSession: true, tab: { remote: { host: 'far' } } });
    start('ask', ['db sqlite query'], 'ask', 'record-1');
    const events = remoteCall(run)[3];
    const command = 'db sqlite query shop SELECT 1';

    events.startCommand?.(command, false);
    events.ranCommand(command, 'dispatched output', false);

    expect(managers.acpRecords.activity).toHaveBeenNthCalledWith(1, 'record-1', 'tool', command);
    expect(managers.acpRecords.activity).toHaveBeenNthCalledWith(2, 'record-1', 'tool', 'dispatched output');
    expect(managers.tab.append).toHaveBeenCalledWith('shell', {
      input: command, output: 'dispatched output', acp: true,
    });
  });

  it('leaves a disabled grep refusal untagged', () => {
    const { start, managers, run } = harness({ remoteSession: true, tab: { remote: { host: 'far' } } });
    start('tell', GRANTS, 'tell', 'record-1');
    const events = remoteCall(run)[3];
    const refusal = 'Command is disabled: file grep.';

    events.startCommand?.(GREP, false);
    events.ranCommand(GREP, refusal, false, 'disabled');

    expect(managers.acpRecords.activity).toHaveBeenNthCalledWith(1, 'record-1', 'tool', GREP);
    expect(managers.acpRecords.activity).toHaveBeenNthCalledWith(2, 'record-1', 'tool', refusal);
    expect(managers.tab.append).toHaveBeenCalledWith('shell', { input: GREP, output: refusal, acp: true });
    expect(mocks.notify).toHaveBeenCalledWith(managers, 'command-disabled', 'shell', refusal);
  });

  it('leaves a role refusal untagged and runs no grep', () => {
    const { start, managers } = harness({ tab: { workspaceDir: dir } });
    const { deps, handlers } = start('tell', ['file read'], 'Writer', 'record-1');
    const refusal = deps.runCommand(GREP);

    expect(refusal).toBe('Command not allowed for role "Writer": file grep.');
    handlers.ranCommand(GREP, refusal as string);
    expect(mocks.grepFilesInTab).not.toHaveBeenCalled();
    expect(managers.acpRecords.activity).toHaveBeenNthCalledWith(1, 'record-1', 'tool', GREP);
    expect(managers.acpRecords.activity).toHaveBeenNthCalledWith(2, 'record-1', 'tool', refusal);
    expect(managers.tab.append).toHaveBeenCalledWith('shell', { input: GREP, output: refusal, acp: true });
    expect(mocks.notify).not.toHaveBeenCalledWith(expect.anything(), 'command-disabled', expect.anything(), expect.anything());
  });
});

describe('runCorePrompt file mutations', () => {
  let dir: string;
  beforeEach(() => {
    vi.clearAllMocks();
    dir = mkdtempSync(path.join(tmpdir(), 'acp-run-prompt-write-'));
    writeFileSync(path.join(dir, 'a.txt'), 'alpha\n');
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const WRITE = 'file write {"path":"notes/b.md","content":"hello"}';
  const PATCH = `file patch ${JSON.stringify({ patchText: '*** Add File: notes/c.md\n+patched\n*** End Patch' })}`;
  const GRANTS = ['file read', 'file write', 'file edit', 'file patch'];

  it('runs a granted file write through the tab runner and changes the file on disk', async () => {
    const { start, dispatchNativeLine } = harness({ tab: { workspaceDir: dir } });
    const { deps } = start('tell', GRANTS);
    const result = await deps.runCommand(WRITE);
    expect(typeof result).toBe('string');
    expect(readFileSync(path.join(dir, 'notes/b.md'), 'utf8')).toBe('hello');
    expect(mocks.mutateFileInTab).toHaveBeenCalledWith(expect.anything(), 'shell', WRITE);
    expect(mocks.readFileInTab).not.toHaveBeenCalled();
    expect(dispatchNativeLine).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalledWith(expect.anything(), 'question', expect.anything(), expect.anything());
  });

  it('returns usage text for a malformed file edit and writes nothing', async () => {
    const { start } = harness({ tab: { workspaceDir: dir } });
    const { deps } = start('tell', GRANTS);
    const usage = (parseFileMutation('file edit {') as { error: string }).error;
    await expect(deps.runCommand('file edit {')).resolves.toBe(usage);
    expect(readFileSync(path.join(dir, 'a.txt'), 'utf8')).toBe('alpha\n');
  });

  it('still sends a read to readFileInTab', async () => {
    const { start } = harness({ tab: { workspaceDir: dir } });
    const { deps } = start('tell', GRANTS);
    await deps.runCommand('file read a.txt');
    expect(mocks.readFileInTab).toHaveBeenCalledWith(expect.anything(), 'shell', 'file read a.txt');
    expect(mocks.mutateFileInTab).not.toHaveBeenCalled();
  });

  it('throws and writes nothing when the prompt is cancelled before the mutation runs', () => {
    const { start } = harness({ tab: { workspaceDir: dir } });
    const { deps, request } = start('tell', GRANTS);
    request.abort.abort();
    expect(() => deps.runCommand(WRITE)).toThrow('ACP: prompt cancelled.');
    expect(existsSync(path.join(dir, 'notes/b.md'))).toBe(false);
    expect(mocks.mutateFileInTab).not.toHaveBeenCalled();
  });

  it('suppresses the late result and next turn when cancelled during a pending mutation', async () => {
    const { start, managers, providerPrompt } = harness({ tab: { workspaceDir: dir } });
    const { deps, handlers, request, session } = start('tell', GRANTS);
    const pending = deps.runCommand(WRITE);
    request.abort.abort();
    const result = await pending;
    handlers.ranCommand(WRITE, result);
    session.prompt('next', { onChunk: vi.fn(), onEnd: vi.fn(), onError: vi.fn() });
    expect(managers.tab.append).not.toHaveBeenCalled();
    expect(providerPrompt).not.toHaveBeenCalled();
  });

  it('refuses a mutation the role does not grant without opening a question', async () => {
    const { start } = harness({ tab: { workspaceDir: dir } });
    const { deps } = start('tell', ['file read']);
    expect(await deps.runCommand(WRITE)).toBe('Command not allowed for role "tell": file write.');
    expect(existsSync(path.join(dir, 'notes/b.md'))).toBe(false);
    expect(mocks.mutateFileInTab).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalledWith(expect.anything(), 'question', expect.anything(), expect.anything());
  });

  it('refuses a mutation disabled in settings without opening a question', async () => {
    const settings = settingsWith({ 'file write': { effectiveEnabled: false, effectiveAgentAccess: false } });
    const { start } = harness({ tab: { workspaceDir: dir }, settings });
    const { deps } = start('tell', GRANTS);
    expect(await deps.runCommand(WRITE)).toBe('Command is disabled: file write.');
    expect(existsSync(path.join(dir, 'notes/b.md'))).toBe(false);
    expect(mocks.mutateFileInTab).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalledWith(expect.anything(), 'question', expect.anything(), expect.anything());
  });

  it('records a successful write and appends its result entry', async () => {
    const { start, managers } = harness({ tab: { workspaceDir: dir } });
    const { deps, handlers } = start('tell', GRANTS, 'tell', 'record-1');
    const result = await deps.runCommand(WRITE);
    handlers.ranCommand(WRITE, result);
    expect(managers.acpRecords.activity).toHaveBeenCalledWith('record-1', 'tool', WRITE);
    expect(managers.tab.append).toHaveBeenCalledWith('shell', { input: WRITE, output: result, acp: true });
  });

  it('runs a granted file patch through the tab runner and creates the file', async () => {
    const { start, dispatchNativeLine } = harness({ tab: { workspaceDir: dir } });
    const { deps } = start('tell', GRANTS);
    await expect(deps.runCommand(PATCH)).resolves.toBe('Patched 1 file:\nA notes/c.md');
    expect(readFileSync(path.join(dir, 'notes/c.md'), 'utf8')).toBe('patched\n');
    expect(mocks.mutateFileInTab).toHaveBeenCalledWith(expect.anything(), 'shell', PATCH);
    expect(dispatchNativeLine).not.toHaveBeenCalled();
  });

  it('throws and writes nothing when the prompt is cancelled before a patch runs', () => {
    const { start } = harness({ tab: { workspaceDir: dir } });
    const { deps, request } = start('tell', GRANTS);
    request.abort.abort();
    expect(() => deps.runCommand(PATCH)).toThrow('ACP: prompt cancelled.');
    expect(existsSync(path.join(dir, 'notes/c.md'))).toBe(false);
    expect(mocks.mutateFileInTab).not.toHaveBeenCalled();
  });

  it('refuses a patch the role does not grant without touching the file', async () => {
    const { start } = harness({ tab: { workspaceDir: dir } });
    const { deps } = start('tell', ['file read']);
    expect(await deps.runCommand(PATCH)).toBe('Command not allowed for role "tell": file patch.');
    expect(existsSync(path.join(dir, 'notes/c.md'))).toBe(false);
    expect(mocks.mutateFileInTab).not.toHaveBeenCalled();
  });

  it('refuses a patch disabled in settings without touching the file', async () => {
    const settings = settingsWith({ 'file patch': { effectiveEnabled: false, effectiveAgentAccess: false } });
    const { start } = harness({ tab: { workspaceDir: dir }, settings });
    const { deps } = start('tell', GRANTS);
    expect(await deps.runCommand(PATCH)).toBe('Command is disabled: file patch.');
    expect(existsSync(path.join(dir, 'notes/c.md'))).toBe(false);
    expect(mocks.mutateFileInTab).not.toHaveBeenCalled();
  });
});

describe('runCorePrompt file glob routing', () => {
  let dir: string;
  beforeEach(() => {
    vi.clearAllMocks();
    dir = mkdtempSync(path.join(tmpdir(), 'acp-run-prompt-glob-'));
    writeFileSync(path.join(dir, 'a.txt'), 'alpha\n');
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const GLOB = 'file glob *.txt';
  const GRANTS = ['file read', 'file glob', 'file write', 'file edit'];

  it('runs a granted file glob through the tab glob runner', async () => {
    const { start } = harness({ tab: { workspaceDir: dir } });
    const { deps, request } = start('tell', GRANTS);
    await expect(deps.runCommand(GLOB)).resolves.toBe('a.txt');
    expect(mocks.globFilesInTab).toHaveBeenCalledWith(expect.anything(), 'shell', GLOB, request.abort.signal);
    expect(mocks.readFileInTab).not.toHaveBeenCalled();
    expect(mocks.mutateFileInTab).not.toHaveBeenCalled();
  });

  it('still sends a read to readFileInTab', async () => {
    const { start } = harness({ tab: { workspaceDir: dir } });
    const { deps } = start('tell', GRANTS);
    await deps.runCommand('file read a.txt');
    expect(mocks.readFileInTab).toHaveBeenCalledWith(expect.anything(), 'shell', 'file read a.txt');
    expect(mocks.globFilesInTab).not.toHaveBeenCalled();
  });

  it('still sends a write to mutateFileInTab', async () => {
    const write = 'file write {"path":"b.md","content":"x"}';
    const { start } = harness({ tab: { workspaceDir: dir } });
    const { deps } = start('tell', GRANTS);
    await deps.runCommand(write);
    expect(mocks.mutateFileInTab).toHaveBeenCalledWith(expect.anything(), 'shell', write);
    expect(mocks.globFilesInTab).not.toHaveBeenCalled();
  });

  it('throws and runs no glob when the prompt is cancelled first', () => {
    const { start } = harness({ tab: { workspaceDir: dir } });
    const { deps, request } = start('tell', GRANTS);
    request.abort.abort();
    expect(() => deps.runCommand(GLOB)).toThrow('ACP: prompt cancelled.');
    expect(mocks.globFilesInTab).not.toHaveBeenCalled();
  });

  it('aborts the signal handed to a pending glob when the prompt is cancelled', async () => {
    const { start } = harness({ tab: { workspaceDir: dir } });
    const { deps, request } = start('tell', GRANTS);
    let received: AbortSignal | undefined;
    mocks.globFilesInTab.mockImplementationOnce((_managers: Managers, _label: string, _input: string, signal?: AbortSignal) => {
      received = signal;
      return new Promise<string>((resolve) => { signal?.addEventListener('abort', () => { resolve('(no matches)'); }); });
    });
    const pending = deps.runCommand(GLOB);
    expect(received?.aborted).toBe(false);
    request.abort.abort();
    await expect(pending).resolves.toBe('(no matches)');
    expect(received?.aborted).toBe(true);
  });

  it('tags a remote tab\'s glob step with the host on the transcript and record lines', () => {
    const { start, managers, run } = harness({
      remoteSession: true, tab: { workspaceDir: dir, remote: { host: 'far' } }, launchDir: dir,
    });
    start('tell', GRANTS, 'tell', 'record-1');
    const events = remoteCall(run)[3];

    events.startCommand?.('file glob *.md', true);
    events.ranCommand('file glob *.md', 'a.md', true);

    expect(managers.acpRecords.activity).toHaveBeenNthCalledWith(1, 'record-1', 'tool', '[far] file glob *.md');
    expect(managers.acpRecords.activity).toHaveBeenNthCalledWith(2, 'record-1', 'tool', '[far] a.md');
    expect(managers.tab.append).toHaveBeenCalledWith('shell', {
      input: '[far] file glob *.md', output: 'a.md', acp: true,
    });
    expect(mocks.globFilesInTab).not.toHaveBeenCalled();
  });
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function regexMessage(pattern: string): string {
  try {
    new RegExp(pattern, 'i');
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error(`Expected ${pattern} to be an invalid regular expression`);
}

describe('runCorePrompt file grep routing', () => {
  let dir: string;
  let launch: string;
  beforeEach(() => {
    vi.clearAllMocks();
    dir = mkdtempSync(path.join(tmpdir(), 'acp-run-prompt-grep-'));
    launch = mkdtempSync(path.join(tmpdir(), 'acp-run-prompt-grep-launch-'));
    writeFileSync(path.join(dir, 'a.txt'), 'workspace TODO\nalpha\n');
    writeFileSync(path.join(dir, 'spaces.txt'), 'hello   world\n');
    writeFileSync(path.join(dir, '.env'), 'TODO=secret\n');
    writeFileSync(path.join(launch, 'launch.txt'), 'launch TODO\n');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(launch, { recursive: true, force: true });
  });

  const GREP = 'file grep TODO';
  const GRANTS = ['file read', 'file glob', 'file grep', 'file write', 'file edit'];

  it('searches the workspace rather than a conflicting launch fixture', async () => {
    const { start, dispatchNativeLine } = harness({ tab: { workspaceDir: dir }, launchDir: launch });
    const { deps } = start('tell', GRANTS);

    await expect(deps.runCommand(GREP)).resolves.toBe('a.txt:1: workspace TODO');
    expect(mocks.grepFilesInTab).toHaveBeenCalledWith(expect.anything(), 'shell', GREP);
    expect(mocks.readFileInTab).not.toHaveBeenCalled();
    expect(dispatchNativeLine).not.toHaveBeenCalled();
  });

  it('falls back to the launch directory when the tab has no workspace', async () => {
    const { start } = harness({ tab: {}, launchDir: launch });
    const { deps } = start('tell', GRANTS);

    await expect(deps.runCommand(GREP)).resolves.toBe('launch.txt:1: launch TODO');
  });

  it('forwards a complete flags-first command intact and keeps the full command in feedback', async () => {
    await withRealLoop(async () => {
      const command = 'file grep --literal --path . --include *.txt --limit 5 hello   world';
      mocks.grepFilesInTab.mockImplementationOnce(() => Promise.resolve('spaces.txt:1: hello   world'));
      const { start, providerPrompt, managers } = harness({ tab: { workspaceDir: dir } });
      const { request } = start('tell', ['file grep'], 'tell', 'record-1');

      reply(providerPrompt, command);
      await vi.waitFor(() => expect(providerPrompt).toHaveBeenCalledTimes(2));

      expect(mocks.grepFilesInTab).toHaveBeenCalledWith(expect.anything(), 'shell', command);
      expect(mocks.grepFilesInTab.mock.calls[0]).toHaveLength(3);
      expect(managers.acpRecords.activity).toHaveBeenNthCalledWith(1, 'record-1', 'tool', command);
      expect(providerPrompt.mock.calls[1]?.[0]).toContain(`Output of \`${command}\`:\nspaces.txt:1: hello   world`);

      reply(providerPrompt, 'Done.');
      await vi.waitFor(() => expect(request.finish).toHaveBeenCalled());
      expect(request.finish).toHaveBeenCalledWith(expect.objectContaining({ answered: true, reply: 'Done.' }));
    });
  });

  it('returns the grep usage line for a bare command', async () => {
    const { start } = harness({ tab: { workspaceDir: dir } });
    const { deps } = start('tell', GRANTS);

    await expect(deps.runCommand('file grep')).resolves.toBe(FILE_GREP_USAGE);
    expect(mocks.grepFilesInTab).toHaveBeenCalledWith(expect.anything(), 'shell', 'file grep');
  });

  it('returns the grep usage line for a malformed flag line', async () => {
    const { start } = harness({ tab: { workspaceDir: dir } });
    const { deps } = start('tell', GRANTS);

    await expect(deps.runCommand('file grep --limit')).resolves.toBe(FILE_GREP_USAGE);
    expect(mocks.readFileInTab).not.toHaveBeenCalled();
  });

  it('reports the typed missing-path diagnostic', async () => {
    const { start } = harness({ tab: { workspaceDir: dir } });
    const { deps } = start('tell', GRANTS);

    await expect(deps.runCommand('file grep --path missing TODO')).resolves.toBe('Path not found: missing.');
  });

  it('reports a malformed regex before reading a contained secret', async () => {
    const { start } = harness({ tab: { workspaceDir: dir } });
    const { deps } = start('tell', GRANTS);
    const discover = vi.spyOn(fileGrepCandidates, 'discoverGrepCandidates');
    const scan = vi.spyOn(fileGrepScan, 'scanFiles');
    try {
      await expect(deps.runCommand('file grep [unclosed'))
        .resolves.toBe(`${regexMessage('[unclosed')}\nUse --literal to search for the text as typed.`);
      expect(discover).not.toHaveBeenCalled();
      expect(scan).not.toHaveBeenCalled();
      expect(mocks.readFileInTab).not.toHaveBeenCalled();
    } finally {
      discover.mockRestore();
      scan.mockRestore();
    }
  });

  it('reports an empty-matching regex before a missing path', async () => {
    const { start } = harness({ tab: { workspaceDir: dir } });
    const { deps } = start('tell', GRANTS);

    await expect(deps.runCommand('file grep --path missing x*'))
      .resolves.toBe('Pattern matches empty text, so it would match every line: x*.');
  });

  it('answers no matches rather than falling through to read', async () => {
    const { start } = harness({ tab: { workspaceDir: dir } });
    const { deps } = start('tell', GRANTS);

    await expect(deps.runCommand('file grep absent a.txt')).resolves.toBe('(no matches)');
    expect(mocks.readFileInTab).not.toHaveBeenCalled();
  });

  it('rejects an unexpected grep failure by identity and reports the ACP error through the real loop', async () => {
    const failure = new Error('grep worker stopped');
    mocks.grepFilesInTab.mockImplementationOnce(() => Promise.reject(failure));
    const seam = harness({ tab: { workspaceDir: dir } });
    const first = seam.start('tell', ['file grep']);
    await expect(first.deps.runCommand(GREP)).rejects.toBe(failure);
    expect(mocks.readFileInTab).not.toHaveBeenCalled();

    await withRealLoop(async () => {
      mocks.grepFilesInTab.mockImplementationOnce(() => Promise.reject(failure));
      const { start, providerPrompt, managers } = harness({ tab: { workspaceDir: dir } });
      const { request } = start('tell', ['file grep'], 'tell', 'record-1');
      reply(providerPrompt, GREP);
      await vi.waitFor(() => expect(request.finish).toHaveBeenCalled());

      expect(request.finish).toHaveBeenCalledWith(expect.objectContaining({
        answered: false, error: `ACP error: ${failure.message}`,
      }));
      expect(managers.tab.append).not.toHaveBeenCalledWith('shell', expect.objectContaining({ acp: true }));
      expect(providerPrompt).toHaveBeenCalledTimes(1);
    });
  });

  it('still routes a read to readFileInTab beside the grep branch', async () => {
    const { start } = harness({ tab: { workspaceDir: dir } });
    const { deps } = start('tell', GRANTS);

    await deps.runCommand('file read a.txt');
    expect(mocks.readFileInTab).toHaveBeenCalledWith(expect.anything(), 'shell', 'file read a.txt');
    expect(mocks.grepFilesInTab).not.toHaveBeenCalled();
  });

  it('still routes a glob to globFilesInTab beside the grep branch', async () => {
    const { start } = harness({ tab: { workspaceDir: dir } });
    const { deps } = start('tell', GRANTS);

    await deps.runCommand('file glob *.txt');
    expect(mocks.globFilesInTab).toHaveBeenCalledWith(expect.anything(), 'shell', 'file glob *.txt', expect.any(AbortSignal));
    expect(mocks.grepFilesInTab).not.toHaveBeenCalled();
  });

  it('still routes a write to mutateFileInTab beside the grep branch', async () => {
    const write = 'file write {"path":"b.md","content":"x"}';
    const { start } = harness({ tab: { workspaceDir: dir } });
    const { deps } = start('tell', GRANTS);

    await deps.runCommand(write);
    expect(mocks.mutateFileInTab).toHaveBeenCalledWith(expect.anything(), 'shell', write);
    expect(mocks.grepFilesInTab).not.toHaveBeenCalled();
  });

  it('still routes an edit to mutateFileInTab beside the grep branch', async () => {
    const edit = 'file edit {"path":"a.txt","oldString":"alpha","newString":"beta"}';
    const { start } = harness({ tab: { workspaceDir: dir } });
    const { deps } = start('tell', GRANTS);

    await deps.runCommand(edit);
    expect(mocks.mutateFileInTab).toHaveBeenCalledWith(expect.anything(), 'shell', edit);
    expect(mocks.grepFilesInTab).not.toHaveBeenCalled();
  });

  it('greps, reads the returned location, and answers through the real loop', async () => {
    writeFileSync(path.join(dir, 'module.ts'), 'export const first = 1;\nexport const FILE_READ_USAGE = 2;\n');
    const grep = 'file grep --literal --path . FILE_READ_USAGE';
    const grepResult = 'module.ts:2: export const FILE_READ_USAGE = 2;';
    const read = 'file read module.ts --offset 2 --limit 1';
    const readResult = '2\texport const FILE_READ_USAGE = 2;';

    await withRealLoop(async () => {
      const { start, providerPrompt, managers, dispatchNativeLine, tab } = harness({ tab: { workspaceDir: dir } });
      const { request } = start('tell', ['file read', 'file grep'], 'tell', 'record-1');

      reply(providerPrompt, grep);
      await vi.waitFor(() => expect(providerPrompt).toHaveBeenCalledTimes(2));

      expect(providerPrompt.mock.calls[0]?.[0]).toContain(FILE_GREP_PRIMER);
      expect(providerPrompt.mock.calls[1]?.[0]).toContain(`Output of \`${grep}\`:\n${grepResult}`);
      expect(mocks.grepFilesInTab).toHaveBeenCalledWith(expect.anything(), 'shell', grep);
      expect(mocks.grepFilesInTab.mock.calls[0]).toHaveLength(3);

      reply(providerPrompt, read);
      await vi.waitFor(() => expect(providerPrompt).toHaveBeenCalledTimes(3));

      expect(providerPrompt.mock.calls[2]?.[0]).toContain(`Output of \`${read}\`:\n${readResult}`);
      expect(mocks.readFileInTab).toHaveBeenCalledWith(expect.anything(), 'shell', read);
      expect(mocks.mutateFileInTab).not.toHaveBeenCalled();
      expect(mocks.globFilesInTab).not.toHaveBeenCalled();

      reply(providerPrompt, 'Found FILE_READ_USAGE.');
      await vi.waitFor(() => expect(request.finish).toHaveBeenCalled());

      expect(request.finish).toHaveBeenCalledWith(expect.objectContaining({
        answered: true, reply: 'Found FILE_READ_USAGE.', session: 'session',
      }));
      expect(dispatchNativeLine).not.toHaveBeenCalled();
      expect(tab.cmdHistory).toEqual(['git status']);
      const appended = vi.mocked(managers.tab.append).mock.calls
        .map(([, entry]) => entry).filter((entry) => entry.acp === true);
      expect(appended).toEqual([
        { input: grep, output: grepResult, acp: true },
        { input: read, output: readResult, acp: true },
      ]);
      expect(vi.mocked(managers.acpRecords.activity).mock.calls).toEqual([
        ['record-1', 'tool', grep],
        ['record-1', 'tool', grepResult],
        ['record-1', 'tool', read],
        ['record-1', 'tool', readResult],
      ]);
    });
  });
});

describe('runCorePrompt file grep loop preservation', () => {
  let dir: string;
  beforeEach(() => {
    vi.clearAllMocks();
    dir = mkdtempSync(path.join(tmpdir(), 'acp-run-prompt-grep-loop-'));
    writeFileSync(path.join(dir, 'a.txt'), 'TODO\n');
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const GREP = 'file grep TODO';
  const RESULT = 'a.txt:1: TODO';

  it('extracts no grep on a without-tools tab even with the grant', async () => {
    await withRealLoop(async () => {
      const { start, providerPrompt } = harness({ withoutTools: true, tab: { workspaceDir: dir } });
      const { request } = start('tell', ['file grep'], 'tell', 'record-1');
      reply(providerPrompt, GREP);
      await vi.waitFor(() => expect(request.finish).toHaveBeenCalled());

      expect(mocks.grepFilesInTab).not.toHaveBeenCalled();
      expect(providerPrompt).toHaveBeenCalledTimes(1);
      expect(request.finish).toHaveBeenCalledWith(expect.objectContaining({ answered: true, reply: GREP }));
    });
  });

  it('caps eight repeated grep steps and makes a ninth provider turn', async () => {
    const previous = mocks.grepFilesInTab.getMockImplementation();
    mocks.grepFilesInTab.mockImplementation(() => Promise.resolve(RESULT));
    try {
      await withRealLoop(async () => {
        const { start, providerPrompt } = harness({ tab: { workspaceDir: dir } });
        const { request } = start('tell', ['file grep'], 'tell', 'record-1');
        for (let step = 0; step < 8; step += 1) {
          reply(providerPrompt, GREP);
          await vi.waitFor(() => expect(providerPrompt).toHaveBeenCalledTimes(step + 2));
        }
        reply(providerPrompt, GREP);
        await vi.waitFor(() => expect(request.finish).toHaveBeenCalled());

        expect(mocks.grepFilesInTab).toHaveBeenCalledTimes(8);
        expect(providerPrompt).toHaveBeenCalledTimes(9);
        expect(request.finish).toHaveBeenCalledWith(expect.objectContaining({
          answered: true, reply: '(stopped after 8 tool steps)',
        }));
      });
    } finally {
      if (previous) mocks.grepFilesInTab.mockImplementation(previous);
    }
  });

  it('runs no grep when the prompt is aborted before execution', async () => {
    await withRealLoop(async () => {
      const { start, providerPrompt, managers } = harness({ tab: { workspaceDir: dir } });
      const { request } = start('tell', ['file grep'], 'tell', 'record-1');
      const handlers = latestPrompt(providerPrompt);
      handlers.onChunk(GREP);
      request.abort.abort();
      handlers.onEnd('end_turn');

      expect(mocks.grepFilesInTab).not.toHaveBeenCalled();
      expect(managers.tab.append).not.toHaveBeenCalledWith('shell', expect.objectContaining({ acp: true }));
      expect(providerPrompt).toHaveBeenCalledTimes(1);
      expect(request.finish).not.toHaveBeenCalled();
    });
  });

  it('suppresses a late grep result and the next turn after an abort', async () => {
    const pending = deferred<string>();
    mocks.grepFilesInTab.mockImplementationOnce(() => pending.promise);
    await withRealLoop(async () => {
      const { start, providerPrompt, managers } = harness({ tab: { workspaceDir: dir } });
      const { request } = start('tell', ['file grep'], 'tell', 'record-1');
      reply(providerPrompt, GREP);
      await vi.waitFor(() => expect(mocks.grepFilesInTab).toHaveBeenCalledOnce());

      request.abort.abort();
      pending.resolve(RESULT);
      await flush();

      expect(providerPrompt).toHaveBeenCalledTimes(1);
      expect(managers.tab.append).not.toHaveBeenCalledWith('shell', expect.objectContaining({ acp: true }));
      expect(managers.acpRecords.activity).not.toHaveBeenCalledWith('record-1', 'tool', RESULT);
      expect(request.finish).not.toHaveBeenCalled();
    });
  });
});

describe('runCorePrompt web routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runWebInTab.mockResolvedValue('search results');
  });

  it('runs a web line through the tab search with the prompt signal', async () => {
    const { start, dispatchNativeLine, managers } = harness({ tab: { workspaceDir: '/project' } });
    const { host, request } = start('tell', ['web search']);

    await expect(host.runWorkspace('web search x')).resolves.toBe('search results');

    expect(mocks.runWebInTab).toHaveBeenCalledWith(managers, 'shell', 'web search x', request.abort.signal);
    expect(mocks.readFileInTab).not.toHaveBeenCalled();
    expect(mocks.globFilesInTab).not.toHaveBeenCalled();
    expect(mocks.mutateFileInTab).not.toHaveBeenCalled();
    expect(dispatchNativeLine).not.toHaveBeenCalled();
  });

  it('hands the search the prompt signal so a later abort reaches it', async () => {
    const { start } = harness();
    const { host, request } = start('tell', ['web search']);

    await host.runWorkspace('web search x');
    const received = mocks.runWebInTab.mock.calls[0]?.[3] as AbortSignal;
    expect(received.aborted).toBe(false);

    request.abort.abort();

    expect(received.aborted).toBe(true);
  });

  it('throws before searching when the prompt is already aborted', () => {
    const { start } = harness();
    const { host } = start('tell', ['web search'], 'tell', undefined, true);

    expect(() => host.runWorkspace('web search x')).toThrow('ACP: prompt cancelled.');
    expect(mocks.runWebInTab).not.toHaveBeenCalled();
  });

  it('routes a local fallback session on a remote tab through the tab search', async () => {
    const { start, managers } = harness({ tab: { remote: { host: 'far' } } });
    const { host } = start('tell', ['web search']);

    await expect(host.runWorkspace('web search x')).resolves.toBe('search results');

    expect(mocks.runWebInTab).toHaveBeenCalledWith(managers, 'shell', 'web search x', expect.any(AbortSignal));
    expect(mocks.readFileInTab).not.toHaveBeenCalled();
  });

  it.each(['web', 'web foo'])('sends %s to the tab search rather than the file reader', async (line) => {
    const { start } = harness();
    const { host } = start('tell', ['web search']);

    await host.runWorkspace(line);

    expect(mocks.runWebInTab).toHaveBeenCalledWith(expect.anything(), 'shell', line, expect.any(AbortSignal));
    expect(mocks.readFileInTab).not.toHaveBeenCalled();
  });

  it('still sends a file read to readFileInTab', async () => {
    const { start } = harness();
    const { host } = start('tell', ['file read']);

    await host.runWorkspace('file read a.txt');

    expect(mocks.readFileInTab).toHaveBeenCalledWith(expect.anything(), 'shell', 'file read a.txt');
    expect(mocks.runWebInTab).not.toHaveBeenCalled();
  });

  it('tags a remote tab\'s web step with the host on the transcript and record lines', () => {
    const { start, managers, run } = harness({ remoteSession: true, tab: { remote: { host: 'far' } } });
    start('tell', ['web search'], 'tell', 'record-1');
    const events = remoteCall(run)[3];

    events.startCommand?.('web search x', true);
    events.ranCommand('web search x', 'result', true);

    expect(managers.acpRecords.activity).toHaveBeenNthCalledWith(1, 'record-1', 'tool', '[far] web search x');
    expect(managers.acpRecords.activity).toHaveBeenNthCalledWith(2, 'record-1', 'tool', '[far] result');
    expect(managers.tab.append).toHaveBeenCalledWith('shell', {
      input: '[far] web search x', output: 'result', acp: true,
    });
    expect(mocks.runWebInTab).not.toHaveBeenCalled();
  });
});

type SnapshotRowInput = {
  name: string;
  savedEnabled?: boolean;
  savedAgentAccess?: boolean;
  effectiveEnabled?: boolean;
  effectiveAgentAccess?: boolean;
};

function snapshotOf(rows: SnapshotRowInput[]): CommandSettingsSnapshot {
  return {
    commands: rows.map((row) => ({
      name: row.name,
      kind: 'native' as const,
      aliases: [],
      forms: [row.name],
      enabled: row.savedEnabled ?? true,
      agentAccess: row.savedAgentAccess ?? true,
      effectiveEnabled: row.effectiveEnabled ?? true,
      effectiveAgentAccess: row.effectiveAgentAccess ?? true,
    })),
    source: 'default',
    path: '',
  };
}

const permissiveRow = (name: string) => ({ name, effectiveEnabled: true, effectiveAgentAccess: true });

describe('coreSnapshotRows', () => {
  it('returns a fresh empty array for undefined settings', () => {
    const first = coreSnapshotRows(undefined);
    const second = coreSnapshotRows(undefined);
    expect(first).toEqual([]);
    expect(second).toEqual([]);
    expect(second).not.toBe(first);
  });

  it('returns permissive rows for the whole vocabulary from a defined empty snapshot', () => {
    expect(coreSnapshotRows(snapshotOf([]))).toEqual(NATIVE_ACP_COMMANDS.map((name) => permissiveRow(name)));
  });

  it('copies an effective-enabled-off value rather than the saved enabled value', () => {
    const rows = coreSnapshotRows(snapshotOf([{
      name: 'file read', savedEnabled: true, effectiveEnabled: false,
    }]));
    expect(rows.find((row) => row.name === 'file read')).toEqual({
      name: 'file read', effectiveEnabled: false, effectiveAgentAccess: true,
    });
  });

  it('copies an effective-agent-access-off value rather than the saved agent access value', () => {
    const rows = coreSnapshotRows(snapshotOf([{
      name: 'file grep', savedAgentAccess: true, effectiveAgentAccess: false,
    }]));
    expect(rows.find((row) => row.name === 'file grep')).toEqual({
      name: 'file grep', effectiveEnabled: true, effectiveAgentAccess: false,
    });
  });

  it('defaults missing vocabulary rows to permissive in a partial snapshot', () => {
    const rows = coreSnapshotRows(snapshotOf([{
      name: 'file write', effectiveEnabled: false, effectiveAgentAccess: false,
    }]));
    expect(rows.find((row) => row.name === 'file write')).toEqual({
      name: 'file write', effectiveEnabled: false, effectiveAgentAccess: false,
    });
    expect(rows.find((row) => row.name === 'browser goto')).toEqual(permissiveRow('browser goto'));
  });

  it('omits a non-vocabulary settings row', () => {
    const rows = coreSnapshotRows(snapshotOf([{
      name: 'unrelated command', effectiveEnabled: false, effectiveAgentAccess: false,
    }]));
    expect(rows.map((row) => row.name)).toEqual([...NATIVE_ACP_COMMANDS]);
    expect(rows.every((row) => row.effectiveEnabled && row.effectiveAgentAccess)).toBe(true);
  });

  it('keeps vocabulary order, fresh rows, and values captured at call time', () => {
    const sourceRows = [{
      name: 'file read', kind: 'native' as const, aliases: [], forms: ['file read'],
      enabled: true, agentAccess: true, effectiveEnabled: false, effectiveAgentAccess: false,
    }];
    const settings = { commands: sourceRows, source: 'default' as const, path: '' } as CommandSettingsSnapshot;
    const first = coreSnapshotRows(settings);
    const second = coreSnapshotRows(settings);

    const captured = () => first.find((row) => row.name === 'file read');
    expect(first.map((row) => row.name)).toEqual([...NATIVE_ACP_COMMANDS]);
    expect(captured()).not.toBe(second.find((row) => row.name === 'file read'));
    expect(captured()).not.toBe(sourceRows[0]);
    sourceRows[0] = { ...sourceRows[0], effectiveEnabled: true, effectiveAgentAccess: true };
    expect(captured()).toEqual({ name: 'file read', effectiveEnabled: false, effectiveAgentAccess: false });
  });
});

describe('runCorePrompt subagent through the real command', () => {
  const RECEIPT = {
    replyId: 'reply-1', kind: 'record' as const, recordId: 'record-1', name: 'subagent:research',
  };
  const GRANTS = ['subagent'];
  beforeEach(() => {
    vi.clearAllMocks();
    subagentMock.launch.mockReturnValue(RECEIPT);
  });

  it('emits the JSON usage for wrong flags with no launch or later message', async () => {
    await withRealLoop(async () => {
      const seam = harness({ realCommand: true, launchDir: subagentLaunchDir() });
      seam.start('tell', GRANTS, 'tell', 'record-1');
      const line = 'subagent --role research --task t.md';
      reply(seam.providerPrompt, line);
      await vi.waitFor(() => expect(seam.providerPrompt).toHaveBeenCalledTimes(2));

      const prompt = seam.providerPrompt.mock.calls[1]?.[0] as string;
      expect(prompt).toContain(`Output of \`${line}\`:`);
      expect(prompt).toContain(SUBAGENT_JSON_USAGE);
      expect(subagentMock.launch).not.toHaveBeenCalled();
      expect(seam.managers.tab.append).toHaveBeenCalledWith('shell', {
        input: line, output: SUBAGENT_JSON_USAGE, acp: true,
      });
    });
  });

  it('emits the JSON usage for malformed JSON with no launch', async () => {
    await withRealLoop(async () => {
      const seam = harness({ realCommand: true, launchDir: subagentLaunchDir() });
      const { request } = seam.start('tell', GRANTS, 'tell', 'record-1');
      reply(seam.providerPrompt, 'subagent {"role":');
      await vi.waitFor(() => expect(seam.providerPrompt).toHaveBeenCalledTimes(2));

      const prompt = seam.providerPrompt.mock.calls[1]?.[0] as string;
      expect(prompt).toContain(SUBAGENT_JSON_USAGE);
      expect(subagentMock.launch).not.toHaveBeenCalled();
      expect(request.finish).not.toHaveBeenCalled();
    });
  });

  it('returns empty tool output for valid JSON before background work', async () => {
    await withRealLoop(async () => {
      const seam = harness({ realCommand: true, launchDir: subagentLaunchDir() });
      seam.start('tell', GRANTS, 'tell', 'record-1');
      const line = 'subagent {"role":"research","task":"t.md"}';
      reply(seam.providerPrompt, line);
      await vi.waitFor(() => expect(seam.providerPrompt).toHaveBeenCalledTimes(2));

      expect(subagentMock.launch).toHaveBeenCalledTimes(1);
      expect(seam.managers.tab.append).toHaveBeenCalledWith('shell', {
        input: line, output: '', acp: true,
      });
      expect(seam.providerPrompt.mock.calls[1]?.[0] as string).toContain(`Output of \`${line}\`:`);
    });
  });

  it('leaves a subagent line as prose with no dispatch on a without-tools tab', async () => {
    await withRealLoop(async () => {
      const seam = harness({ realCommand: true, withoutTools: true, launchDir: subagentLaunchDir() });
      const { request } = seam.start('tell', GRANTS, 'tell', 'record-1');
      const line = 'subagent {"role":"research","task":"t.md"}';
      reply(seam.providerPrompt, line);
      await vi.waitFor(() => expect(request.finish).toHaveBeenCalled());

      expect(seam.providerPrompt).toHaveBeenCalledTimes(1);
      expect(subagentMock.launch).not.toHaveBeenCalled();
      expect(request.finish).toHaveBeenCalledWith(expect.objectContaining({ answered: true, reply: line }));
    });
  });
});
