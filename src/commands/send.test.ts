import { describe, it, expect } from 'vitest';
import { command, parseSendCommand } from './send.js';

describe('send command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('send');
  });

  it('matches send commands', () => {
    expect(command.match('send claude /standup')).toBe(true);
    expect(command.match('SEND claude /standup')).toBe(true);
    expect(command.match('send')).toBe(true);
  });

  it('does not match non-send input', () => {
    expect(command.match('sender')).toBe(false);
    expect(command.match('sen d')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });
});

describe('parseSendCommand', () => {
  it('errors with no args', () => {
    expect(parseSendCommand('send')).toEqual({ error: 'Usage: send <label> <text>' });
  });

  it('errors with no text', () => {
    expect(parseSendCommand('send claude')).toEqual({ error: 'No text to send.' });
  });

  it('parses a label and text', () => {
    expect(parseSendCommand('send claude /standup')).toEqual({ label: 'claude', text: '/standup' });
  });

  it('joins multi-word text', () => {
    expect(parseSendCommand('send worker db vacuum')).toEqual({ label: 'worker', text: 'db vacuum' });
  });
});
