import { describe, it, expect, vi } from 'vitest';
import { recognizeRoute } from './route-choice.js';
import type { Managers } from './managers.js';

function makeManagers(openDbs: string[]): Managers {
  return { database: { openDbs: vi.fn(() => openDbs) } } as unknown as Managers;
}

describe('recognizeRoute', () => {
  it('answers the prefixed command when a statement routes to the one open database', () => {
    const managers = makeManagers(['mydb']);

    expect(recognizeRoute('SELECT * FROM foo;', 'tab1', managers)).toEqual({
      kind: 'routed',
      command: 'db sqlite query mydb SELECT * FROM foo;',
    });
    expect(managers.database.openDbs).toHaveBeenCalledWith('tab1');
  });

  it('answers the open databases when nothing routes, so a caller can offer them as choices', () => {
    expect(recognizeRoute('totally-bogus-command', 'tab1', makeManagers(['a', 'b']))).toEqual({
      kind: 'unrouted',
      openDbs: ['a', 'b'],
    });
  });

  it('leaves a database statement unrouted when more than one database could take it', () => {
    expect(recognizeRoute('SELECT * FROM foo;', 'tab1', makeManagers(['a', 'b']))).toEqual({
      kind: 'unrouted',
      openDbs: ['a', 'b'],
    });
  });
});
