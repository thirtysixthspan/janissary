import { describe, it, expect } from 'vitest';
import { getOutput, availableCommands } from './commands.js';

describe('getOutput', () => {
  it('returns dashboard message', () => {
    expect(getOutput('dashboard')).toBe('Welcome to the CLI dashboard.');
  });

  it('returns settings message', () => {
    expect(getOutput('settings')).toBe('Settings panel — no settings yet.');
  });

  it('returns about message', () => {
    expect(getOutput('about')).toBe('Custom CLI built with Ink & React.');
  });

  it('returns help with all commands listed', () => {
    const result = getOutput('help');
    for (const cmd of availableCommands) {
      expect(result).toContain(cmd);
    }
    expect(result).toContain('Prefix a command with');
  });

  it('returns null for clear', () => {
    expect(getOutput('clear')).toBeNull();
  });

  it('returns null for quit', () => {
    expect(getOutput('quit')).toBeNull();
  });

  it('returns null for exit', () => {
    expect(getOutput('exit')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getOutput('')).toBeNull();
  });

  it('returns null for whitespace-only input', () => {
    expect(getOutput('   ')).toBeNull();
  });

  it('is case insensitive', () => {
    expect(getOutput('DASHBOARD')).toBe('Welcome to the CLI dashboard.');
    expect(getOutput('About')).toBe('Custom CLI built with Ink & React.');
    expect(getOutput('HELP')).toContain('Prefix a command with');
  });

  it('returns error for unknown commands', () => {
    const result = getOutput('foobar');
    expect(result).toContain('Unknown command');
    expect(result).toContain('foobar');
    expect(result).toContain('"help"');
  });

  it('returns error for gibberish', () => {
    expect(getOutput('xyzzy')).toContain('Unknown command');
  });
});
