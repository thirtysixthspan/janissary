import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { completeFileReadCommand } from './file-read.js';
import { readCompletionCursor } from './cursor.js';
import { completionPolicy, type CompletionPolicy } from './command-policy.js';
import { NativeCommandSettingsManager } from '../native-commands/manager.js';

const at = (line: string) => readCompletionCursor(line, line.length);

let root: string;
let elsewhere: string;
let settings: string;
let globRoot: string;

function policyWith(values: Record<string, { enabled?: boolean }>): CompletionPolicy {
  const home = path.join(settings, 'home');
  mkdirSync(path.join(home, '.janissary'), { recursive: true });
  writeFileSync(path.join(home, '.janissary', 'commands.json'), JSON.stringify(values));
  return completionPolicy(new NativeCommandSettingsManager(path.join(settings, 'project'), home).current());
}

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'file-read-root-'));
  elsewhere = mkdtempSync(path.join(tmpdir(), 'file-read-elsewhere-'));
  settings = mkdtempSync(path.join(tmpdir(), 'file-read-settings-'));
  globRoot = mkdtempSync(path.join(tmpdir(), 'file-glob-root-'));
  writeFileSync(path.join(root, 'notes.md'), '');
  mkdirSync(path.join(root, 'docs'));
  writeFileSync(path.join(elsewhere, 'nothing.md'), '');
  writeFileSync(path.join(globRoot, 'notes.md'), '');
  writeFileSync(path.join(globRoot, 'dogs.md'), '');
  mkdirSync(path.join(globRoot, 'docs'));
  mkdirSync(path.join(globRoot, '.hidden'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(elsewhere, { recursive: true, force: true });
  rmSync(settings, { recursive: true, force: true });
  rmSync(globRoot, { recursive: true, force: true });
});

describe('completeFileReadCommand', () => {
  it('completes the read subcommand', () => {
    expect(completeFileReadCommand(at('file r'), root)?.newInput).toBe('file read ');
    expect(completeFileReadCommand(at('file '), root)?.matches).toEqual(['glob', 'read']);
  });

  it('completes the glob subcommand', () => {
    expect(completeFileReadCommand(at('file g'), root)?.newInput).toBe('file glob ');
  });

  it('does not offer a disabled file glob subcommand', () => {
    const policy = policyWith({ 'file glob': { enabled: false } });
    expect(completeFileReadCommand(at('file '), root, policy)?.matches).toEqual(['read']);
  });

  it('returns null for another command', () => {
    expect(completeFileReadCommand(at('files r'), root)).toBeNull();
  });

  it('completes a path from the given root rather than another directory', () => {
    expect(completeFileReadCommand(at('file read no'), root)?.newInput).toBe('file read notes.md ');
    expect(completeFileReadCommand(at('file read no'), elsewhere)?.newInput).toBe('file read nothing.md ');
  });

  it('appends a slash to a unique directory match', () => {
    expect(completeFileReadCommand(at('file read do'), root)?.newInput).toBe('file read docs/');
  });

  it('completes the offset and limit flags', () => {
    expect(completeFileReadCommand(at('file read notes.md --'), root)?.matches).toEqual(['--limit', '--offset']);
    expect(completeFileReadCommand(at('file read notes.md --o'), root)?.newInput).toBe('file read notes.md --offset ');
  });

  it('offers nothing for a flag value', () => {
    for (const line of ['file read notes.md --offset ', 'file read notes.md --limit n']) {
      const result = completeFileReadCommand(at(line), root);
      expect(result?.matches).toEqual([]);
      expect(result?.newInput).toBe(line);
    }
  });

  it('offers no paths without a root, as on a remote tab', () => {
    const result = completeFileReadCommand(at('file read no'), undefined);
    expect(result?.matches).toEqual([]);
    expect(result?.newInput).toBe('file read no');
    expect(completeFileReadCommand(at('file r'), undefined)?.newInput).toBe('file read ');
  });

  it('offers nothing after a subcommand other than read or glob', () => {
    expect(completeFileReadCommand(at('file write no'), root)?.matches).toEqual([]);
  });
});

describe('completeFileReadCommand file glob', () => {
  const expectUnchanged = (line: string, { remote = false } = {}) => {
    const result = completeFileReadCommand(at(line), remote ? undefined : globRoot);
    expect(result?.matches).toEqual([]);
    expect(result?.newInput).toBe(line);
  };

  it('completes the glob flags', () => {
    expect(completeFileReadCommand(at('file glob *.ts --'), globRoot)?.matches)
      .toEqual(['--dirs', '--hidden', '--limit', '--path']);
    expect(completeFileReadCommand(at('file glob *.ts --h'), globRoot)?.newInput).toBe('file glob *.ts --hidden ');
  });

  it('completes only directories after --path', () => {
    expect(completeFileReadCommand(at('file glob * --path do'), globRoot)?.newInput)
      .toBe('file glob * --path docs/');
    expectUnchanged('file glob * --path n');
  });

  it('offers no directories after --path without a root, as on a remote tab', () => {
    expectUnchanged('file glob * --path do', { remote: true });
  });

  it('offers nothing for the limit value', () => {
    expectUnchanged('file glob * --limit ');
    expectUnchanged('file glob * --limit 5');
  });

  it('offers nothing for the pattern and does not fall back to paths', () => {
    expectUnchanged('file glob *.t');
    expectUnchanged('file glob src/fi');
  });
});
