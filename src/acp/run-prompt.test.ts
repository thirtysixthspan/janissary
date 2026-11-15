import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
import type * as TabRead from '../file-read/tab-read.js';
import type * as TabGlob from '../file-glob/tab-glob.js';
import type * as TabGrep from '../file-grep/tab-grep.js';
import type * as Loop from './loop.js';
import { MARKDOWN_INSTRUCTION } from './launch.js';
import { BROWSER_PRIMER } from '../browser/command.js';
import { DB_PRIMER } from '../database/primer.js';
import { FILE_GREP_PRIMER, FILE_GREP_USAGE } from '../file-grep/command.js';
import * as fileGrepCandidates from '../file-grep/candidates.js';
import * as fileGrepScan from '../file-grep/scan.js';
import { commandProtocolPrimer } from './command-protocol.js';
import { CORE_MAX_STEPS } from './drive-loop.js';
import { deferred } from '../deferred.js';

const mocks = vi.hoisted(() => ({
  runAcpToolLoop: vi.fn(), notify: vi.fn(), readFileInTab: vi.fn(), mutateFileInTab: vi.fn(),
  globFilesInTab: vi.fn(), grepFilesInTab: vi.fn(),
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

import { runCorePrompt } from './run-prompt.js';

const homeRoots: string[] = [];
beforeEach(() => {
  const dir = mkdtempSync(path.join(tmpdir(), 'acp-run-prompt-home-'));
  home.dir = dir;
  homeRoots.push(dir);
});
afterEach(() => {
  for (const dir of homeRoots) rmSync(dir, { recursive: true, force: true });
  homeRoots.length = 0;
});

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
};

function harness(options: Omit<StartOptions, 'commands' | 'roleName'> = {}) {
  const dispatchNativeLine = vi.fn(async () => ({ dispatched: true, output: 'dispatched output' }));
  const runtime = { acpWithoutTools: options.withoutTools ?? false, acpRoles: {} } as unknown as TabRuntime;
  const tab = {
    runtime, ...options.tab, cmdHistory: ['git status'], cmdHistoryIdx: -1,
  };
  const managers = {
    tab: {
      updateRunning: vi.fn(),
      deleteBusy: vi.fn(),
      append: vi.fn(),
      byLabel: vi.fn(() => tab),
      workingDirOf: vi.fn(() => '/project'),
      launchDir: options.launchDir ?? '/launch',
    },
    acpRecords: { activity: vi.fn(), answer: vi.fn() },
    command: { dispatchNativeLine },
    ...(options.settings && { nativeCommandSettings: options.settings }),
  } as unknown as Managers;
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
    if (aborted) request.abort.abort();
    const nativeSettings = options.settings?.current();
    runCorePrompt(managers, 'shell', runtime, request, nativeSettings, session, 'session', () => true);
    const call = mocks.runAcpToolLoop.mock.calls.at(-1);
    const deps = call?.[2] as AcpLoopDeps;
    const handlers = call?.[3] as AcpLoopHandlers;
    const loopSession = call?.[0] as AcpLoopSession;
    return { deps, request, handlers, session: loopSession, run };
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
    expect(result.indexOf(NO_BUILTIN_TOOLS_LINE)).toBeLessThan(result.indexOf('How commands work:'));
    expect(result.indexOf('How commands work:')).toBeLessThan(result.indexOf(TELL_INSTRUCTION));
    expect(result.indexOf(TELL_INSTRUCTION)).toBeLessThan(result.indexOf(MARKDOWN_INSTRUCTION));
  });
});

describe('runCorePrompt tool runner', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('dispatches a granted caller-side command with the prompt signal and resolves to its output', async () => {
    const { start, dispatchNativeLine } = harness({ settings: settingsWith({}) });
    const { deps, request } = start('ask', ['db sqlite query']);
    await expect(deps.runCommand('db sqlite query shop SELECT 1')).resolves.toBe('dispatched output');
    expect(dispatchNativeLine).toHaveBeenCalledWith(
      'shell',
      'db sqlite query shop SELECT 1',
      expect.objectContaining({ acpTool: true, awaitResult: true, signal: request.abort.signal }),
    );
  });

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

  it('dispatches a granted caller command through the guarded runner with the prompt signal', async () => {
    const { start, dispatchNativeLine, run } = harness({ remoteSession: true });
    const { request } = start('ask', ['db sqlite query']);
    const runCaller = remoteCall(run)[2];

    await expect(runCaller('db sqlite query shop SELECT 1')).resolves.toBe('dispatched output');
    expect(dispatchNativeLine).toHaveBeenCalledWith(
      'shell',
      'db sqlite query shop SELECT 1',
      expect.objectContaining({ acpTool: true, awaitResult: true, signal: request.abort.signal }),
    );
  });

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
  const GRANTS = ['file read', 'file write', 'file edit'];

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
