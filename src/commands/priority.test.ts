import { describe, it, expect } from 'vitest';
import { findPriorityConflicts } from './priority.js';
import type { Command } from './types.js';

const make = (name: string, pattern: RegExp, samples: string[]): Command => ({
  name,
  match: (command) => pattern.test(command),
  samples,
  run: () => {},
});

describe('findPriorityConflicts', () => {
  it('reports nothing when no command claims another\'s input', () => {
    const list = [
      make('agent', /^agent\b/i, ['agent', 'agent bob']),
      make('next', /^next$/i, ['next']),
    ];

    expect(findPriorityConflicts(list)).toEqual([]);
  });

  it('reports the input a broader command positioned first steals', () => {
    const list = [
      make('acp', /^acp\b/i, ['acp']),
      make('acp-reset', /^acp\s+reset\b/i, ['acp reset']),
    ];

    expect(findPriorityConflicts(list)).toEqual([
      { input: 'acp reset', owner: 'acp-reset', matchedBy: 'acp' },
    ]);
  });

  it('clears once the specific command precedes the broader one', () => {
    const list = [
      make('acp-reset', /^acp\s+reset\b/i, ['acp reset']),
      make('acp', /^acp\b/i, ['acp']),
    ];

    expect(findPriorityConflicts(list)).toEqual([]);
  });

  it('reports a sample no command in the list matches', () => {
    const list = [make('agent', /^agent\b/i, ['agent', 'agnet'])];

    expect(findPriorityConflicts(list)).toEqual([
      { input: 'agnet', owner: 'agent', matchedBy: null },
    ]);
  });

  it('accepts an input a later command would also match', () => {
    const list = [
      make('monitors', /^monitors$/i, ['monitors']),
      make('anything', /./, ['zzz']),
    ];

    expect(findPriorityConflicts(list)).toEqual([]);
  });

  it('reports every shadowed sample, not just the first', () => {
    const list = [
      make('broad', /^x\b/i, ['x']),
      make('narrow', /^x\s+(one|two)\b/i, ['x one', 'x two']),
    ];

    expect(findPriorityConflicts(list)).toEqual([
      { input: 'x one', owner: 'narrow', matchedBy: 'broad' },
      { input: 'x two', owner: 'narrow', matchedBy: 'broad' },
    ]);
  });
});
