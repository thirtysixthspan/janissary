import { describe, it, expect, vi } from 'vitest';
import { command } from './broadcast.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';

function makeManagers(labels: string[], sendable: (label: string) => boolean = () => true) {
  const append = vi.fn();
  const send = vi.fn((message: { to: string }) => sendable(message.to));
  const managers = {
    tab: { append, allLabels: () => labels },
    communication: { send },
  } as unknown as Managers;
  return { managers, append, send };
}

const from = { label: 'me' } as Tab;

describe('broadcast command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('broadcast');
  });

  it('matches broadcast commands', () => {
    expect(command.match('broadcast all info hi')).toBe(true);
    expect(command.match('BROADCAST all info hi')).toBe(true);
    expect(command.match('broadcast bilal,wali info hi')).toBe(true);
  });

  it('does not match non-broadcast input', () => {
    expect(command.match('broad cast')).toBe(false);
    expect(command.match('msg all info hi')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });

  // The parser owns the usage wording, so a malformed command reports what it said rather than
  // inventing a second message here — and sends nothing on the way to finding that out.
  it('reports the parser\'s own message and sends nothing for a malformed command', () => {
    const { managers, append, send } = makeManagers(['me', 'other']);
    command.run('broadcast all', from, managers);
    expect(send).not.toHaveBeenCalled();
    expect(append).toHaveBeenCalledWith('me', {
      input: 'broadcast all',
      output: 'Usage: broadcast <all|agent[,agent...]> <info|request|command> <text>',
    });
  });

  // `all` means every *other* tab: a broadcast the sender also received would be the one reply it
  // is trying to prompt.
  it('sends to every other tab for `all`, never to the sender', () => {
    const { managers, append, send } = makeManagers(['me', 'other', 'third']);
    command.run('broadcast all info hello', from, managers);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([m]) => m.to)).toEqual(['other', 'third']);
    expect(send).toHaveBeenCalledWith({ from: 'me', to: 'other', kind: 'info', text: 'hello' });
    expect(append).not.toHaveBeenCalled();
  });

  it('sends to exactly the named tabs', () => {
    const { managers, send } = makeManagers(['me', 'other', 'third']);
    command.run('broadcast third info hello', from, managers);
    expect(send).toHaveBeenCalledExactlyOnceWith({ from: 'me', to: 'third', kind: 'info', text: 'hello' });
  });

  // A name no agent holds is a send the transport refused. Reporting every miss in one line beats
  // failing on the first, so a broadcast to a list that is half wrong still reaches the half that works.
  it('names every recipient the transport refused, and still reaches the rest', () => {
    const { managers, append, send } = makeManagers(['me'], (label) => label !== 'ghost');
    command.run('broadcast other,ghost,third info hello', from, managers);
    expect(send).toHaveBeenCalledTimes(3);
    expect(append).toHaveBeenCalledWith('me', {
      input: 'broadcast other,ghost,third info hello',
      output: 'No agent named: ghost.',
    });
  });

  it('names every recipient when none of them could be reached', () => {
    const { managers, append } = makeManagers(['me'], () => false);
    command.run('broadcast one,two info hello', from, managers);
    expect(append).toHaveBeenCalledWith('me', {
      input: 'broadcast one,two info hello',
      output: 'No agent named: one, two.',
    });
  });
});
