import { afterEach, describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initGlobalHistory, recordGlobalHistory, globalCommands } from './global-history.js';
import * as atomicWrite from './atomic-write.js';

function makeHome(): string {
  return mkdtempSync(path.join(tmpdir(), 'janus-ghist-'));
}

describe('global-history', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
    initGlobalHistory(makeHome());
    const home = makeHome();
    const dir = path.join(home, '.janissary');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'history.json'), '{not valid json');
    const warning = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(() => initGlobalHistory(home)).not.toThrow();
    expect(globalCommands()).toEqual([]);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('could not read history.json'));
  });

  it('starts empty on non-array file without throwing', () => {
    initGlobalHistory(makeHome());
    const home = makeHome();
    const dir = path.join(home, '.janissary');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'history.json'), '{"key": "value"}');
    const warning = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(() => initGlobalHistory(home)).not.toThrow();
    expect(globalCommands()).toEqual([]);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('history.json must contain an array'));
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

  it('uses atomic replacement for creation and updates', () => {
    const writer = vi.spyOn(atomicWrite, 'atomicWriteFile');
    const home = makeHome();

    initGlobalHistory(home);
    recordGlobalHistory('hello', 'tab-a');

    const filePath = path.join(home, '.janissary', 'history.json');
    expect(writer).toHaveBeenNthCalledWith(1, filePath, '[]');
    expect(writer).toHaveBeenNthCalledWith(2, filePath, expect.stringContaining('"command": "hello"'));
  });

  it('leaves a corrupt history file byte-for-byte unchanged after a record', () => {
    const home = makeHome();
    const dir = path.join(home, '.janissary');
    mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, 'history.json');
    writeFileSync(filePath, '{not valid json');
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    initGlobalHistory(home);

    recordGlobalHistory('kept in memory', 'tab-a');

    expect(readFileSync(filePath, 'utf8')).toBe('{not valid json');
    expect(globalCommands()).toEqual(['kept in memory']);
  });

  it('does not overwrite a file that becomes unreadable after a successful start', () => {
    const home = makeHome();
    initGlobalHistory(home);
    recordGlobalHistory('first', 'tab-a');
    const filePath = path.join(home, '.janissary', 'history.json');
    writeFileSync(filePath, '[{"command": "trunc');
    const warning = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    recordGlobalHistory('second', 'tab-a');
    recordGlobalHistory('third', 'tab-a');

    expect(readFileSync(filePath, 'utf8')).toBe('[{"command": "trunc');
    expect(globalCommands()).toEqual(['first', 'second', 'third']);
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('could not read history.json'));
  });

  it('keeps entries another instance wrote to the file since startup', () => {
    const home = makeHome();
    initGlobalHistory(home);
    recordGlobalHistory('mine', 'tab-a');
    const filePath = path.join(home, '.janissary', 'history.json');
    const onDisk = JSON.parse(readFileSync(filePath, 'utf8')) as unknown[];
    writeFileSync(filePath, JSON.stringify([...onDisk, { command: 'theirs', tab: 'other', timestamp: 2 }]));

    recordGlobalHistory('mine again', 'tab-a');

    expect(globalCommands()).toEqual(['mine', 'theirs', 'mine again']);
    initGlobalHistory(home);
    expect(globalCommands()).toEqual(['mine', 'theirs', 'mine again']);
  });

  it('judges a consecutive duplicate against the last command on disk', () => {
    const home = makeHome();
    initGlobalHistory(home);
    recordGlobalHistory('repeat', 'tab-a');
    const filePath = path.join(home, '.janissary', 'history.json');
    const onDisk = JSON.parse(readFileSync(filePath, 'utf8')) as unknown[];
    writeFileSync(filePath, JSON.stringify([...onDisk, { command: 'theirs', tab: 'other', timestamp: 2 }]));

    recordGlobalHistory('repeat', 'tab-a');

    expect(globalCommands()).toEqual(['repeat', 'theirs', 'repeat']);
  });

  it('retains valid history and bounds warnings across failed updates', () => {
    const originalWriter = atomicWrite.atomicWriteFile;
    const writer = vi.spyOn(atomicWrite, 'atomicWriteFile');
    const warning = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const home = makeHome();
    initGlobalHistory(home);
    recordGlobalHistory('persisted', 'tab-a');
    writer.mockImplementation(() => { throw new Error('disk full'); });

    recordGlobalHistory('memory one', 'tab-a');
    recordGlobalHistory('memory two', 'tab-a');

    expect(warning).toHaveBeenCalledTimes(1);
    initGlobalHistory(home);
    expect(globalCommands()).toEqual(['persisted']);

    writer.mockImplementation(originalWriter);
    recordGlobalHistory('recovered', 'tab-a');
    writer.mockImplementation(() => { throw new Error('read only'); });
    recordGlobalHistory('later failure', 'tab-a');
    expect(warning).toHaveBeenCalledTimes(2);
  });
});
