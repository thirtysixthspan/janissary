import { describe, it, expect } from 'vitest';
import { command } from './acp-reset.js';

describe('acp-reset command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('acp-reset');
  });

  it('matches "acp reset" case-insensitively', () => {
    expect(command.match('acp reset')).toBe(true);
    expect(command.match('ACP RESET')).toBe(true);
    expect(command.match('Acp Reset')).toBe(true);
  });

  it('matches with extra whitespace', () => {
    expect(command.match('acp  reset')).toBe(true);
  });

  it('does not match bare "acp"', () => {
    expect(command.match('acp')).toBe(false);
  });

  it('does not match "acp resume"', () => {
    expect(command.match('acp resume')).toBe(false);
  });

  it('does not match "acp" with a prompt', () => {
    expect(command.match('acp summarize this repo')).toBe(false);
  });
});
