import { describe, expect, it } from 'vitest';
import { parseDockArgument } from './dock-argument.js';

describe('parseDockArgument', () => {
  it('names the sidebar a bare side word asks for', () => {
    expect(parseDockArgument('left')).toBe('left');
    expect(parseDockArgument('right')).toBe('right');
  });

  it('reads the side word in any case', () => {
    expect(parseDockArgument('RIGHT')).toBe('right');
    expect(parseDockArgument('Left')).toBe('left');
  });

  it('ignores whitespace around the side word', () => {
    expect(parseDockArgument('  left\t')).toBe('left');
  });

  it('answers null for an empty or blank argument, which means back to the centre', () => {
    expect(parseDockArgument('')).toBeNull();
    expect(parseDockArgument(' \t ')).toBeNull();
  });

  it('answers undefined for anything that is not exactly one side word', () => {
    expect(parseDockArgument('center')).toBeUndefined();
    expect(parseDockArgument('left notes')).toBeUndefined();
  });
});
