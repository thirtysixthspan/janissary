import { describe, expect, it } from 'vitest';
import { commandExample } from './command-example.js';

describe('commandExample', () => {
  it('wraps one command in a fence labelled exactly janissary', () => {
    expect(commandExample('file read README.md')).toBe('```janissary\nfile read README.md\n```');
  });

  it('keeps a multi-line command intact inside the fence', () => {
    expect(commandExample('file read a.md\n--offset 4')).toBe('```janissary\nfile read a.md\n--offset 4\n```');
  });
});
