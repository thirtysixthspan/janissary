import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import type { TabRuntime } from '../tab/types.js';
import type { AcpPendingPrompt } from './prompt-state.js';
import type { AcpLoopDeps, AcpSession } from './types.js';
import { MARKDOWN_INSTRUCTION } from './launch.js';

const mocks = vi.hoisted(() => ({ runAcpToolLoop: vi.fn() }));

vi.mock('./loop.js', () => ({ runAcpToolLoop: mocks.runAcpToolLoop }));

import { runCorePrompt } from './run-prompt.js';

const TELL_INSTRUCTION = 'The user is instructing you to carry out a task. Do it with the commands available to you, then briefly report what you did.';

function primer(role: 'ask' | 'tell', withoutTools = false): string {
  mocks.runAcpToolLoop.mockClear();
  const request: AcpPendingPrompt = {
    finish: vi.fn(), abort: new AbortController(), prompt: 'instructions', role,
    roleName: role, commands: ['db sqlite query'], runningEntries: new Set(),
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
    expect(primer('tell', true)).toBe([TELL_INSTRUCTION, MARKDOWN_INSTRUCTION].join('\n\n'));
  });

  it('omits the tell instruction from ask when the tab-wide no-tools override is set', () => {
    const result = primer('ask', true);
    expect(result).toBe(MARKDOWN_INSTRUCTION);
    expect(result).not.toContain(TELL_INSTRUCTION);
  });
});
