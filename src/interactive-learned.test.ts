import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { loadLearnedCommands, learnedCommands, learnedKey, recordLearnedCommand } from './interactive-learned.js';

const FILE = path.join('.janissary', 'interactive-commands.json');

describe('learnedKey', () => {
  it('keeps a bare program name when the argument is not a subcommand', () => {
    expect(learnedKey('mytui')).toBe('mytui');
    expect(learnedKey('mytui --watch')).toBe('mytui');
    expect(learnedKey('vim notes.txt')).toBe('vim');
    expect(learnedKey('./scripts/dashboard')).toBe('dashboard');
  });

  it('narrows to program plus subcommand so one mode does not capture the whole front-end', () => {
    expect(learnedKey('git log')).toBe('git log');
    expect(learnedKey('docker attach web')).toBe('docker attach');
  });

  it('looks past wrappers and environment assignments', () => {
    expect(learnedKey('sudo mytui')).toBe('mytui');
    expect(learnedKey('FOO=1 mytui')).toBe('mytui');
  });

  it('refuses a multi-segment command, whose screen cannot be attributed', () => {
    expect(learnedKey('git log | less')).toBeUndefined();
    expect(learnedKey('make && mytui')).toBeUndefined();
    expect(learnedKey('a; b')).toBeUndefined();
  });

  it('refuses an empty command', () => {
    expect(learnedKey(' '.repeat(3))).toBeUndefined();
  });
});

describe('the learned command file', () => {
  let tmpDir: string;

  const read = (): unknown => JSON.parse(readFileSync(path.join(tmpDir, FILE), 'utf8'));

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'learned-test-'));
    mkdirSync(path.join(tmpDir, '.janissary'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('starts empty when no file exists, then round-trips what it records', () => {
    loadLearnedCommands(tmpDir);
    expect([...learnedCommands()]).toEqual([]);

    recordLearnedCommand('mytui --watch');
    expect([...learnedCommands()]).toEqual(['mytui']);
    expect(read()).toEqual(['mytui']);

    loadLearnedCommands(tmpDir);
    expect([...learnedCommands()]).toEqual(['mytui']);
  });

  it('does not append a key it already holds', () => {
    loadLearnedCommands(tmpDir);
    recordLearnedCommand('mytui');
    recordLearnedCommand('mytui --watch');
    expect(read()).toEqual(['mytui']);
  });

  it('records nothing for a command it refuses to attribute', () => {
    loadLearnedCommands(tmpDir);
    recordLearnedCommand('git log | less');
    expect([...learnedCommands()]).toEqual([]);
  });

  it('keeps only the most recent entries', () => {
    loadLearnedCommands(tmpDir);
    for (let index = 0; index < 205; index++) recordLearnedCommand(`tui${index}`);
    const entries = read() as string[];
    expect(entries).toHaveLength(200);
    expect(entries[0]).toBe('tui5');
    expect(entries.at(-1)).toBe('tui204');
    expect(learnedCommands().has('tui0')).toBe(false);
  });

  it('loads a corrupt file as empty and leaves it on disk', () => {
    const file = path.join(tmpDir, FILE);
    writeFileSync(file, 'not json at all');
    loadLearnedCommands(tmpDir);
    expect([...learnedCommands()]).toEqual([]);
    expect(readFileSync(file, 'utf8')).toBe('not json at all');
  });

  it('loads a well-formed file that is not an array of strings as empty', () => {
    writeFileSync(path.join(tmpDir, FILE), JSON.stringify({ mytui: true }));
    loadLearnedCommands(tmpDir);
    expect([...learnedCommands()]).toEqual([]);
  });
});
