import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import type { TabRuntime } from '../tab/types.js';
import type { AcpPendingPrompt } from './prompt-state.js';
import type { AcpLoopDeps, AcpSession } from './types.js';
import type { NativeCommandSettingsManager } from '../native-commands/manager.js';
import { MARKDOWN_INSTRUCTION } from './launch.js';
import { BROWSER_PRIMER } from '../browser/command.js';

const mocks = vi.hoisted(() => ({ runAcpToolLoop: vi.fn() }));

vi.mock('./loop.js', () => ({ runAcpToolLoop: mocks.runAcpToolLoop }));

import { runCorePrompt } from './run-prompt.js';

const TELL_INSTRUCTION = 'The user is instructing you to carry out a task. Do it with the commands available to you, then briefly report what you did.';
const NO_BUILTIN_TOOLS_LINE = 'You have no built-in tools; use only the commands listed here.';
const NO_TOOLS_LINE = 'You have no tools; answer in prose.';

function settingsWith(
  rows: Record<string, { effectiveEnabled?: boolean; effectiveAgentAccess?: boolean }>,
): NativeCommandSettingsManager {
  return {
    current: () => ({
      commands: Object.entries(rows).map(([name, values]) => ({
        name,
        effectiveEnabled: values.effectiveEnabled ?? true,
        effectiveAgentAccess: values.effectiveAgentAccess ?? true,
      })),
      source: 'default',
      path: '',
    }),
  } as unknown as NativeCommandSettingsManager;
}

function primer(
  role: 'ask' | 'tell',
  options: {
    withoutTools?: boolean;
    commands?: string[];
    settings?: NativeCommandSettingsManager;
  } = {},
): string {
  const { withoutTools = false, commands = ['db sqlite query'], settings } = options;
  mocks.runAcpToolLoop.mockClear();
  const request: AcpPendingPrompt = {
    finish: vi.fn(), abort: new AbortController(), prompt: 'instructions', role,
    roleName: role, commands, runningEntries: new Set(),
  };
  const runtime = {
    acpWithoutTools: withoutTools,
    acpRoles: { [role]: { prompt: request } },
  } as unknown as TabRuntime;
  const managers = {
    tab: { updateRunning: vi.fn() },
    acpRecords: {},
    database: { primer: 'database primer', runInTab: vi.fn(), isCommandLine: vi.fn() },
    browser: { run: vi.fn() },
    questions: { register: vi.fn() },
    ...(settings && { nativeCommandSettings: settings }),
  } as unknown as Managers;
  const session = { prompt: vi.fn() } as unknown as AcpSession;

  runCorePrompt(managers, 'shell', runtime, request, session, 'session', () => true);

  const call = mocks.runAcpToolLoop.mock.calls.at(-1);
  return (call?.[2] as AcpLoopDeps).primer;
}

describe('runCorePrompt role primer', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('places the tell instruction after available tool text and before Markdown', () => {
    expect(primer('tell')).toBe([
      'database primer',
      'Only these commands are allowed: db sqlite query.',
      NO_BUILTIN_TOOLS_LINE,
      TELL_INSTRUCTION,
      MARKDOWN_INSTRUCTION,
    ].join('\n\n'));
  });

  it('does not give the ask role the tell instruction', () => {
    const result = primer('ask');
    expect(result).not.toContain(TELL_INSTRUCTION);
    expect(result.startsWith('database primer')).toBe(true);
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
    expect(result).toContain('database primer');
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
