import { describe, it, expect } from 'vitest';
import { command, parseClose } from './close.js';

describe('close command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('close');
  });

  it('matches "close" case-insensitively', () => {
    expect(command.match('close')).toBe(true);
    expect(command.match('CLOSE')).toBe(true);
    expect(command.match('Close')).toBe(true);
  });

  it('matches "close page n" with the broadened matcher', () => {
    expect(command.match('close page 1')).toBe(true);
    expect(command.match('CLOSE PAGE 3')).toBe(true);
  });

  it('does not match non-close input', () => {
    expect(command.match('closer')).toBe(false);
    expect(command.match('clos')).toBe(false);
    expect(command.match('quit')).toBe(false);
  });
});

describe('parseClose', () => {
  it('returns active for bare close', () => {
    expect(parseClose('close')).toEqual({ target: 'active' });
  });

  it('returns page + number for "close page n"', () => {
    expect(parseClose('close page 3')).toEqual({ target: 'page', number: 3 });
  });

  it('is case-insensitive on keywords', () => {
    expect(parseClose('CLOSE PAGE 5')).toEqual({ target: 'page', number: 5 });
  });

  it('returns error for "close page" with no number', () => {
    expect(parseClose('close page')).toHaveProperty('error');
  });

  it('returns error for "close page abc"', () => {
    expect(parseClose('close page abc')).toHaveProperty('error');
  });

  it('returns error for unknown subcommands', () => {
    expect(parseClose('close tab 2')).toHaveProperty('error');
  });
});
