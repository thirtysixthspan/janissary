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

  it('answers null arguments with the malformed-arguments error and leaves no pending call', () => {
    const { relay, register, send } = fixture();
    const args = 'null';

    relay.handle({ type: 'mcp-call', call: 'call-1', tool: 'question', args });

    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: 'mcp-result', call: 'call-1', text: `Malformed MCP arguments: ${args}`, isError: true,
    });
    expect(register).not.toHaveBeenCalled();
  });

  it('answers string arguments with the malformed-arguments error and leaves no pending call', () => {
    const { relay, register, send } = fixture();
    const args = '"just a string"';

    relay.handle({ type: 'mcp-call', call: 'call-1', tool: 'question', args });

    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: 'mcp-result', call: 'call-1', text: `Malformed MCP arguments: ${args}`, isError: true,
    });
    expect(register).not.toHaveBeenCalled();
  });

  it('answers array arguments with the malformed-arguments error and lets a later valid call with the same id register', async () => {
    const { relay, call, register, send, answer } = fixture();
    const args = '[{"tab":"asker"}]';

    relay.handle({ type: 'mcp-call', call: 'call-1', tool: 'question', args });

    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: 'mcp-result', call: 'call-1', text: `Malformed MCP arguments: ${args}`, isError: true,
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

  it('answers number arguments with the malformed-arguments error and leaves no pending call', () => {
    const { relay, register, send } = fixture();
    const args = '42';

    relay.handle({ type: 'mcp-call', call: 'call-1', tool: 'question', args });

    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: 'mcp-result', call: 'call-1', text: `Malformed MCP arguments: ${args}`, isError: true,
    });
    expect(register).not.toHaveBeenCalled();
  });

  it('answers boolean arguments with the malformed-arguments error and leaves no pending call', () => {
    const { relay, register, send } = fixture();
    const args = 'true';

    relay.handle({ type: 'mcp-call', call: 'call-1', tool: 'question', args });

    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: 'mcp-result', call: 'call-1', text: `Malformed MCP arguments: ${args}`, isError: true,
    });
    expect(register).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'an unknown tool', tool: 'shell', args: { tab: 'asker', kind: 'ask', question: 'Which port?' }, text: 'Unknown MCP tool "shell".' },
    { label: 'a non-string question', tool: 'question', args: { tab: 'asker', kind: 'ask', question: { text: 'Which port?' } }, text: 'question must not be empty.' },
    { label: 'a non-string option', tool: 'question', args: { tab: 'asker', kind: 'approve', question: 'Deploy?', options: ['Yes', 2] }, text: 'options must be a list of strings.' },
    { label: 'an unknown kind', tool: 'question', args: { tab: 'asker', kind: 'maybe', question: 'Deploy?' }, text: 'kind must be "ask" or "approve".' },
  ])('refuses $label without registering and lets a later valid call with the same id register', async ({ tool, args, text }) => {
    const { relay, call, register, send, answer } = fixture();

    relay.handle({ type: 'mcp-call', call: 'call-1', tool, args: JSON.stringify(args) });

    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'mcp-result', call: 'call-1', text, isError: true });
    expect(register).not.toHaveBeenCalled();

    send.mockClear();
    call('call-1');
    expect(answer('3000')).toBe(true);
    await vi.waitFor(() => expect(send).toHaveBeenCalledExactlyOnceWith({
      type: 'mcp-result', call: 'call-1', text: '3000', isError: false,
    }));
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('answers a non-string tab as the empty name without registering', async () => {
    const { relay, register, send } = fixture();

    relay.handle({
      type: 'mcp-call', call: 'call-1', tool: 'question',
      args: JSON.stringify({ tab: 7, kind: 'ask', question: 'Which port?' }),
    });

    await vi.waitFor(() => expect(send).toHaveBeenCalledExactlyOnceWith({
      type: 'mcp-result', call: 'call-1', text: 'No tab named "".', isError: true,
    }));
    expect(register).not.toHaveBeenCalled();
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
