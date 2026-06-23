import { describe, it, expect } from 'vitest';
import { getOutput } from '../commands.js';

describe('getOutput', () => {
  it('returns help with commands and key bindings', () => {
    const result = getOutput('help');
    expect(result).toContain('Commands');
    expect(result).toContain('Key Bindings');
    expect(result).toContain('connection');
    expect(result).toContain('Ctrl+C');
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

  it('returns null for close', () => {
    expect(getOutput('close')).toBeNull();
  });

  it('returns null for agent commands', () => {
    expect(getOutput('agent')).toBeNull();
    expect(getOutput('agent Bob')).toBeNull();
  });

  it('returns null for next', () => {
    expect(getOutput('next')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getOutput('')).toBeNull();
  });

  it('returns null for whitespace-only input', () => {
    expect(getOutput('   ')).toBeNull();
  });

  it('is case insensitive', () => {
    expect(getOutput('HELP')).toContain('Commands');
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
