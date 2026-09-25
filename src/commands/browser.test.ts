import { describe, it, expect, vi } from 'vitest';
import { command } from './browser.js';
import type { Managers } from '../managers.js';

describe('browser command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('browser');
  });

  it('matches browser commands', () => {
    expect(command.match('browser goto https://example.com')).toBe(true);
    expect(command.match('BROWSER goto https://example.com')).toBe(true);
    expect(command.match('browser')).toBe(true);
  });

  it('does not match non-browser input', () => {
    expect(command.match('browserr')).toBe(false);
    expect(command.match('brows')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });

  it('answers an agent message by handing the reply to the browser manager', () => {
    const runInteractive = vi.fn();
    const managers = { browser: { runInteractive } } as unknown as Managers;
    const reply = vi.fn();

    command.capture!('browser open example.com', 'main', managers, reply);

    expect(runInteractive).toHaveBeenCalledWith('browser open example.com', 'main', reply);
  });
});
