import { describe, it, expect, vi } from 'vitest';
import { command } from './acp.js';
import type { Managers } from '../managers.js';

describe('acp command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('acp');
  });

  it('matches acp commands', () => {
    expect(command.match('acp summarize this repo')).toBe(true);
    expect(command.match('ACP summarize this repo')).toBe(true);
    expect(command.match('acp')).toBe(true);
  });

  it('does not match non-acp input', () => {
    expect(command.match('acp-extra')).toBe(true); // \b matches before '-'
    expect(command.match('acp  ')).toBe(true);
    expect(command.match('clear')).toBe(false);
  });

  it('answers an agent message by handing the reply to the acp manager', () => {
    const run = vi.fn();
    const managers = { acp: { run } } as unknown as Managers;
    const reply = vi.fn();

    command.capture!('acp hello', 'main', managers, reply);

    expect(run).toHaveBeenCalledWith('main', 'acp hello', reply);
  });
});
