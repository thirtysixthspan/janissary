import { describe, it, expect, beforeEach } from 'vitest';
import { command, SEARCH_USAGE } from './search.js';
import type { LogEntry } from '../types.js';

describe('search command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('search');
  });

  it('matches "search transcript" case-insensitively', () => {
    expect(command.match('search transcript error')).toBe(true);
    expect(command.match('SEARCH TRANSCRIPT error')).toBe(true);
    expect(command.match('search transcript')).toBe(true);
  });

  it('does not match non-search input, or search without transcript', () => {
    expect(command.match('searching transcript')).toBe(false);
    expect(command.match('search')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });
});

describe('search command run', () => {
  let outputs: string[];
  let tab: { label: string; index: number };
  let managers: unknown;

  beforeEach(() => {
    outputs = [];
    tab = { label: 'janus', index: 0 };
    const log: LogEntry[] = [
      { input: 'run build', output: 'an error occurred while building' },
      { input: 'run tests', output: 'all good' },
    ];
    managers = {
      tab: {
        append: (_label: string, entry: LogEntry) => { outputs.push(entry.output); },
        tabs: [{ label: 'janus', log }],
      },
    };
  });

  const run = (command_: string) => command.run!(command_, tab, managers as never);

  it('reports the most recent matching line', () => {
    run('search transcript error');
    expect(outputs.at(-1)).toContain('an error occurred while building');
  });

  it('reports no matches found', () => {
    run('search transcript zzznotfound');
    expect(outputs.at(-1)).toBe('No matches found in the transcript.');
  });

  it('reports usage for a missing pattern', () => {
    run('search transcript');
    expect(outputs.at(-1)).toBe(SEARCH_USAGE);
  });

  it('reports usage for an invalid regex pattern', () => {
    run('search transcript [');
    expect(outputs.at(-1)).toBe(SEARCH_USAGE);
  });
});
