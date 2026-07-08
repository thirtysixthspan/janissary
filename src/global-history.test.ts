import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initGlobalHistory, recordGlobalHistory, globalCommands } from './global-history.js';

function makeHome(): string {
  return mkdtempSync(path.join(tmpdir(), 'janus-ghist-'));
}

describe('global-history', () => {
  it('fresh init gives an empty buffer', () => {
    const home = makeHome();
    initGlobalHistory(home);
    expect(globalCommands()).toEqual([]);
  });

  it('creates .janissary/ and history.json when missing', () => {
    const home = makeHome();
    initGlobalHistory(home);
    const filePath = path.join(home, '.janissary', 'history.json');
    expect(readFileSync(filePath, 'utf8')).toBe('[]');
  });

  it('loads existing entries from file', () => {
    const home = makeHome();
    const dir = path.join(home, '.janissary');
    mkdirSync(dir, { recursive: true });
    const entries = [{ command: 'old cmd', tab: 't1', timestamp: 1000 }];
    writeFileSync(path.join(dir, 'history.json'), JSON.stringify(entries));
    initGlobalHistory(home);
    expect(globalCommands()).toEqual(['old cmd']);
  });

  it('starts empty on corrupt JSON without throwing', () => {
    const home = makeHome();
    const dir = path.join(home, '.janissary');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'history.json'), '{not valid json');
    expect(() => initGlobalHistory(home)).not.toThrow();
    expect(globalCommands()).toEqual([]);
  });

  it('starts empty on non-array file without throwing', () => {
    const home = makeHome();
    const dir = path.join(home, '.janissary');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'history.json'), '{"key": "value"}');
    expect(() => initGlobalHistory(home)).not.toThrow();
    expect(globalCommands()).toEqual([]);
  });

  it('drops bad-shaped entries and keeps valid ones', () => {
    const home = makeHome();
    const dir = path.join(home, '.janissary');
    mkdirSync(dir, { recursive: true });
    const entries = [
      { command: 'good', tab: 't1', timestamp: 1000 },
      { command: 123, tab: 't1', timestamp: 2000 },
      { tab: 't1', timestamp: 3000 },
    ];
    writeFileSync(path.join(dir, 'history.json'), JSON.stringify(entries));
    initGlobalHistory(home);
    expect(globalCommands()).toEqual(['good']);
  });

  it('records an entry and the file round-trips through a re-init', () => {
    const home = makeHome();
    initGlobalHistory(home);
    recordGlobalHistory('hello', 'tab-a');
    initGlobalHistory(home);
    expect(globalCommands()).toEqual(['hello']);
  });

  it('skips consecutive duplicate commands regardless of tab', () => {
    const home = makeHome();
    initGlobalHistory(home);
    recordGlobalHistory('dup', 'tab-a');
    recordGlobalHistory('dup', 'tab-b');
    expect(globalCommands()).toEqual(['dup']);
  });

  it('returns oldest to newest command strings', () => {
    const home = makeHome();
    initGlobalHistory(home);
    recordGlobalHistory('first', 't');
    recordGlobalHistory('second', 't');
    recordGlobalHistory('third', 't');
    expect(globalCommands()).toEqual(['first', 'second', 'third']);
  });

  it('does not throw on write failure', () => {
    const home = makeHome();
    initGlobalHistory(home);
    const filePath = path.join(home, '.janissary', 'history.json');
    rmSync(filePath);
    mkdirSync(filePath);
    expect(() => recordGlobalHistory('test', 't')).not.toThrow();
    expect(globalCommands()).toEqual(['test']);
  });
});
