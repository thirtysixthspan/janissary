import { describe, expect, it } from 'vitest';
import { listApplicationCommands, resolveApplicationCommand } from './application-commands.js';

describe('application command inventory caching', () => {
  it('returns the same sorted inventory on every call', () => {
    const first = listApplicationCommands();
    expect(listApplicationCommands()).toBe(first);
    expect(first.map((row) => row.name)).toEqual(first.map((row) => row.name).toSorted((a, b) => a.localeCompare(b)));
  });

  it('keeps resolving commands from the cached inventory without altering it', () => {
    const before = structuredClone(listApplicationCommands());
    expect(resolveApplicationCommand('tab dock x')).toMatchObject({ name: 'tab dock', forms: ['tab dock'] });
    expect(resolveApplicationCommand('tab dock x')).toMatchObject({ name: 'tab dock', forms: ['tab dock'] });
    expect(listApplicationCommands()).toEqual(before);
  });
});
