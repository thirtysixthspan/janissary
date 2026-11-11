import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseFileRead, type FileReadArgs } from '../file-read/command.js';
import { readWorkspaceLines } from '../file-read/read.js';
import type { Managers } from '../managers.js';
import type { TabRuntime } from '../tab/types.js';
import type { AcpPendingPrompt } from './prompt-state.js';
import type { AcpLoopDeps, AcpSession } from './types.js';
import type { NativeCommandSettingsManager } from '../native-commands/manager.js';
import { MARKDOWN_INSTRUCTION } from './launch.js';
import { BROWSER_PRIMER } from '../browser/command.js';
import { DB_PRIMER } from '../database/primer.js';

const mocks = vi.hoisted(() => ({ runAcpToolLoop: vi.fn(), notify: vi.fn() }));

vi.mock('./loop.js', () => ({ runAcpToolLoop: mocks.runAcpToolLoop }));
vi.mock('../notifications/index.js', () => ({ notify: mocks.notify }));

import { runCorePrompt } from './run-prompt.js';

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
};

function harness(options: Omit<StartOptions, 'commands' | 'roleName'> = {}) {
  const dispatchNativeLine = vi.fn(async () => ({ dispatched: true, output: 'dispatched output' }));
  const managers = {
    tab: {
      updateRunning: vi.fn(),
      byLabel: vi.fn(() => options.tab),
      workingDirOf: vi.fn(() => '/project'),
      launchDir: options.launchDir ?? '/launch',
    },
    acpRecords: {},
    command: { dispatchNativeLine },
    ...(options.settings && { nativeCommandSettings: options.settings }),
  } as unknown as Managers;
  const runtime = { acpWithoutTools: options.withoutTools ?? false, acpRoles: {} } as unknown as TabRuntime;
  const session = { prompt: vi.fn() } as unknown as AcpSession;
  const start = (role: 'ask' | 'tell' = 'ask', commands: string[] = ['db sqlite query'], roleName: string = role) => {
    const request: AcpPendingPrompt = {
      finish: vi.fn(), abort: new AbortController(), prompt: 'instructions', role,
      roleName, commands, runningEntries: new Set(),
    };
    (runtime as unknown as { acpRoles: Record<string, unknown> }).acpRoles[role] = { prompt: request };
    mocks.runAcpToolLoop.mockClear();
    runCorePrompt(managers, 'shell', runtime, request, session, 'session', () => true);
    const deps = mocks.runAcpToolLoop.mock.calls.at(-1)?.[2] as AcpLoopDeps;
    return { deps, request };
  };
  return { managers, dispatchNativeLine, start };
}

function primer(role: 'ask' | 'tell', options: StartOptions = {}): string {
  return harness(options).start(role, options.commands, options.roleName).deps.primer;
}

describe('runCorePrompt role primer', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('places the tell instruction after available tool text and before Markdown', () => {
    expect(primer('tell')).toBe([
      DB_PRIMER,
      'Only these commands are allowed: db sqlite query.',
      NO_BUILTIN_TOOLS_LINE,
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
    expect(result.indexOf(NO_BUILTIN_TOOLS_LINE)).toBeLessThan(result.indexOf(TELL_INSTRUCTION));
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
    const { deps } = start('ask', ['db sqlite query']);
    expect(deps.runCommand('db sqlite query shop SELECT 1')).toBe('Command is disabled: db sqlite query.');
    expect(mocks.notify).toHaveBeenCalledWith(
      managers, 'command-disabled', 'shell', 'Command is disabled: db sqlite query.',
    );
    expect(dispatchNativeLine).not.toHaveBeenCalled();
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

  it('reads the settings once per prompt however many commands run', async () => {
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

    it('takes the remote path on a remote tab, never the local disk', async () => {
      const { start } = harness({ tab: { workspaceDir: dir, remote: { host: 'far' } }, launchDir: dir });
      const { deps } = start('ask', ['file read']);
      await expect(deps.runCommand('file read a.txt')).resolves.toBe('Remote connection unavailable.');
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
