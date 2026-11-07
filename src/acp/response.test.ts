import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import type { AcpPendingPrompt } from './prompt-state.js';
import type { AcpPromptResult } from './types.js';
import { makeTab } from '../tab/index.js';

vi.mock('../bus.js', () => ({ messageBus: { emit: vi.fn() } }));

import { settleAcpPrompt } from './response.js';

function setup(recordId?: string) {
  const tab = makeTab('tab1', '#fff');
  const finish = vi.fn();
  const pending: AcpPendingPrompt = {
    finish, abort: new AbortController(), prompt: 'hello', role: 'ask', roleName: 'ask',
    commands: [], runningEntries: new Set(),
  };
  const ask: { prompt?: AcpPendingPrompt; recordId?: string } = { prompt: pending };
  if (recordId) {
    pending.recordId = recordId;
    ask.recordId = recordId;
  }
  tab.runtime = { busy: false, context: [], queue: [], acpRoles: { ask } };
  const answer = vi.fn();
  const managers = {
    tab: {
      byLabel: (label: string) => (label === 'tab1' ? tab : undefined),
      updateRunning: vi.fn(),
      deleteBusy: vi.fn(),
    },
    acpRecords: { answer },
  } as unknown as Managers;
  return { answer, ask, finish, managers };
}

const ANSWER: AcpPromptResult = { answered: true, reply: 'the answer', session: 'acp-1' };

describe('settleAcpPrompt', () => {
  it.each<[string, AcpPromptResult]>([
    ['an answer', ANSWER],
    ['an ACP error line', { answered: false, error: 'ACP error: rate limited' }],
    ['a cancellation', { answered: false, error: 'ACP: prompt cancelled.' }],
    ['a closed session', { answered: false, error: 'ACP session closed.' }],
  ])('hands finish %s with the pending prompt’s record id added', (_name, result) => {
    const { finish, managers } = setup('record-1');

    settleAcpPrompt(managers, 'tab1', result);

    expect(finish).toHaveBeenCalledExactlyOnceWith({ ...result, recordId: 'record-1' });
  });

  it('records the original answer text on the record', () => {
    const { answer, managers } = setup('record-1');

    settleAcpPrompt(managers, 'tab1', ANSWER);

    expect(answer).toHaveBeenCalledExactlyOnceWith('record-1', 'the answer');
  });

  it('keeps the id on the result when the settlement callback has already dropped the role state’s id', () => {
    const { ask, finish, managers } = setup('record-1');

    settleAcpPrompt(managers, 'tab1', ANSWER, () => { delete ask.recordId; });

    expect(ask.recordId).toBeUndefined();
    expect(finish).toHaveBeenCalledExactlyOnceWith({ ...ANSWER, recordId: 'record-1' });
  });

  it('passes the identical result through when the pending prompt reached no record', () => {
    const { answer, finish, managers } = setup();
    const result: AcpPromptResult = { answered: false, error: 'ACP session closed.' };

    settleAcpPrompt(managers, 'tab1', result);

    expect(finish.mock.calls[0][0]).toBe(result);
    expect(finish.mock.calls[0][0]).not.toHaveProperty('recordId');
    expect(answer).not.toHaveBeenCalled();
  });

  it('does not write the id onto the incoming result, which a tab close shares between roles', () => {
    const { finish, managers } = setup('record-1');
    const result: AcpPromptResult = { answered: false, error: 'ACP session closed.' };

    settleAcpPrompt(managers, 'tab1', result);

    expect(result).not.toHaveProperty('recordId');
    expect(finish.mock.calls[0][0]).not.toBe(result);
  });

  it.each([
    ['the tab is gone', 'missing', false],
    ['the pending prompt is gone', 'tab1', true],
  ])('only runs the settlement callback when %s', (_name, label, dropPrompt) => {
    const { ask, finish, managers } = setup('record-1');
    if (dropPrompt) delete ask.prompt;
    const afterSettlement = vi.fn();

    settleAcpPrompt(managers, label, ANSWER, afterSettlement);

    expect(finish).not.toHaveBeenCalled();
    expect(afterSettlement).toHaveBeenCalledOnce();
  });
});
