import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandInvocationContext } from './types.js';
import { command } from './web.js';

const mocks = vi.hoisted(() => ({ runWebInTab: vi.fn() }));

vi.mock('../web/tab-web.js', () => ({ runWebInTab: mocks.runWebInTab }));

type Appended = { label: string; entry: { input: string; output: string }; invocationId?: string };

function managersWith(appended: Appended[]) {
  return {
    tab: {
      append: (label: string, entry: { input: string; output: string }) => { appended.push({ label, entry }); },
      appendForInvocation: (label: string, entry: { input: string; output: string }, invocationId: string) => {
        appended.push({ label, entry, invocationId });
      },
    },
  } as never;
}

describe('web command match', () => {
  it('claims web and web search lines and rejects a longer word', () => {
    expect(command.match('web')).toBe(true);
    expect(command.match('Web search x')).toBe(true);
    expect(command.match('webby')).toBe(false);
  });
});

describe('web command run', () => {
  let appended: Appended[];

  beforeEach(() => {
    appended = [];
    vi.resetAllMocks();
    mocks.runWebInTab.mockResolvedValue('search results');
  });

  it('runs the entry point and appends the input and output once', async () => {
    const managers = managersWith(appended);
    await command.run('web search x', { label: 'janus', index: 0 }, managers);
    expect(mocks.runWebInTab.mock.calls[0]).toEqual([managers, 'janus', 'web search x']);
    expect(appended).toEqual([{ label: 'janus', entry: { input: 'web search x', output: 'search results' } }]);
  });

  it('passes a bare web line through unchanged and appends its output', async () => {
    const managers = managersWith(appended);
    mocks.runWebInTab.mockResolvedValue('both usage lines');
    await command.run('web', { label: 'janus', index: 0 }, managers);
    expect(mocks.runWebInTab.mock.calls[0]).toEqual([managers, 'janus', 'web']);
    expect(appended).toEqual([{ label: 'janus', entry: { input: 'web', output: 'both usage lines' } }]);
  });

  it('appends through the invocation when one is given', async () => {
    const managers = managersWith(appended);
    const invocation = { invocationId: 'inv-1' } as CommandInvocationContext;
    await command.run('web search x', { label: 'janus', index: 0 }, managers, invocation);
    expect(appended).toEqual([
      { label: 'janus', entry: { input: 'web search x', output: 'search results' }, invocationId: 'inv-1' },
    ]);
  });
});
