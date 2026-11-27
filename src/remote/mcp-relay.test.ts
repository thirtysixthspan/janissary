import type { Managers } from '../managers.js';
import { deliverNotification } from '../notifications/deliver.js';
import { QUESTION_CANCELLED, Questions } from '../questions.js';
import type { Tab } from '../tab/types.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteChannel } from './channel/index.js';
import type { ChannelTransport } from './channel/types.js';
import { createMcpRelay } from './mcp-relay.js';

vi.mock('../notifications/deliver.js', () => ({ deliverNotification: vi.fn() }));

function fixture() {
  const tabs = [{
    label: 'asker',
    harness: { name: 'claude', program: 'claude', ptyId: 'pty-1', status: 'running' },
  }] as unknown as Tab[];
  const questions = new Questions();
  const register = vi.spyOn(questions, 'register');
  const managers = {
    tab: { tabs, byLabel: (label: string) => tabs.find((tab) => tab.label === label), cur: () => tabs[0] },
    questions,
  } as unknown as Managers;
  const send = vi.fn();
  const relay = createMcpRelay(managers, send);
  const transport: ChannelTransport = { id: 'pty-1', write: vi.fn(), kill: vi.fn() };
  const channel = new RemoteChannel(transport, {
    onTerminalData: vi.fn(),
    onAttached: vi.fn(),
    onFrame: vi.fn(),
    onError: vi.fn(),
    onClose: vi.fn(),
    onFinalClose: () => relay.clear(),
  });
  const call = (id: string, question = 'Which port?') => relay.handle({
    type: 'mcp-call', call: id, tool: 'question',
    args: JSON.stringify({ tab: 'asker', kind: 'ask', question }),
  });
  const answer = (text: string) => questions.answer('asker', questions.pendingFor('asker')!.id, text);
  return { questions, register, send, relay, call, answer, channel };
}

beforeEach(() => { vi.mocked(deliverNotification).mockClear(); });

describe('createMcpRelay', () => {
  it('attaches a re-sent call to the in-flight question instead of registering a second', () => {
    const { call, register, questions } = fixture();

    call('call-1');
    call('call-1');

    expect(register).toHaveBeenCalledTimes(1);
    expect(questions.pendingFor('asker')?.question).toBe('Which port?');
  });

  it('answers a re-sent settled call from the stored result without registering again', async () => {
    const { call, register, answer, send } = fixture();
    call('call-1');
    expect(answer('3000')).toBe(true);
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith({
      type: 'mcp-result', call: 'call-1', text: '3000', isError: false,
    }));
    send.mockClear();

    call('call-1');

    expect(register).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: 'mcp-result', call: 'call-1', text: '3000', isError: false,
    });
  });

  it('answers malformed arguments as an error and lets a later valid call with the same id register', async () => {
    const { relay, call, register, send, answer } = fixture();

    relay.handle({ type: 'mcp-call', call: 'call-1', tool: 'question', args: '{not json' });

    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: 'mcp-result', call: 'call-1', text: 'Malformed MCP arguments: {not json', isError: true,
    });
    expect(register).not.toHaveBeenCalled();

    send.mockClear();
    call('call-1');
    expect(answer('3000')).toBe(true);
    await vi.waitFor(() => expect(send).toHaveBeenCalledExactlyOnceWith({
      type: 'mcp-result', call: 'call-1', text: '3000', isError: false,
    }));
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('clears the map on channel close so a re-send registers a fresh question', () => {
    const { call, register, channel } = fixture();
    call('call-1');

    channel.close();
    channel.close();
    call('call-1');

    expect(register).toHaveBeenCalledTimes(2);
  });

  it('withdraws an unanswered question on cancel and shows the next queued one', async () => {
    const { call, relay, register, questions, send } = fixture();
    call('call-1', 'First?');
    call('call-2', 'Second?');
    expect(questions.pendingFor('asker')?.question).toBe('First?');

    relay.cancel({ type: 'mcp-cancel', call: 'call-1' });

    await vi.waitFor(() => expect(send).toHaveBeenCalledWith({
      type: 'mcp-result', call: 'call-1', text: QUESTION_CANCELLED, isError: false,
    }));
    expect(questions.pendingFor('asker')?.question).toBe('Second?');
    expect(register).toHaveBeenCalledTimes(2);
    expect(deliverNotification).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deliverNotification).mock.calls[0]?.[1]).toMatchObject({
      event: 'question-withdrawn',
      tabLabel: 'asker',
      message: 'Question from asker withdrawn',
    });
  });

  it('ignores a cancel after the answer and still replays the stored result', async () => {
    const { call, relay, answer, register, send } = fixture();
    call('call-1');
    expect(answer('3000')).toBe(true);
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith({
      type: 'mcp-result', call: 'call-1', text: '3000', isError: false,
    }));
    send.mockClear();

    relay.cancel({ type: 'mcp-cancel', call: 'call-1' });
    call('call-1');

    expect(deliverNotification).not.toHaveBeenCalled();
    expect(register).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: 'mcp-result', call: 'call-1', text: '3000', isError: false,
    });
  });

  it('ignores a cancel for a call it never registered', () => {
    const { call, relay, questions } = fixture();
    call('call-1');

    relay.cancel({ type: 'mcp-cancel', call: 'missing' });

    expect(questions.pendingFor('asker')?.question).toBe('Which port?');
    expect(deliverNotification).not.toHaveBeenCalled();
  });
});
