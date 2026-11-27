import type { Managers } from '../managers.js';
import { Questions } from '../questions.js';
import type { Tab } from '../tab/types.js';
import { describe, expect, it, vi } from 'vitest';
import { createMcpRelay } from './mcp-relay.js';

function fixture() {
  const tabs = [{
    label: 'asker',
    harness: { name: 'claude', program: 'claude', ptyId: 'pty-1', status: 'running' },
  }] as unknown as Tab[];
  const questions = new Questions();
  const register = vi.spyOn(questions, 'register');
  const managers = {
    tab: { tabs, byLabel: (label: string) => tabs.find((tab) => tab.label === label) },
    questions,
  } as unknown as Managers;
  const send = vi.fn();
  const relay = createMcpRelay(managers, send);
  const call = (id: string, question = 'Which port?') => relay.handle({
    type: 'mcp-call', call: id, tool: 'question',
    args: JSON.stringify({ tab: 'asker', kind: 'ask', question }),
  });
  const answer = (text: string) => questions.answer('asker', questions.pendingFor('asker')!.id, text);
  return { questions, register, send, relay, call, answer };
}

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
    const { call, register, relay } = fixture();
    call('call-1');

    relay.clear();
    call('call-1');

    expect(register).toHaveBeenCalledTimes(2);
  });
});
