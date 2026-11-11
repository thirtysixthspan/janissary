import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { completeFileReadCommand } from './file-read.js';
import { readCompletionCursor } from './cursor.js';

const at = (line: string) => readCompletionCursor(line, line.length);

let root: string;
let elsewhere: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'file-read-root-'));
  elsewhere = mkdtempSync(path.join(tmpdir(), 'file-read-elsewhere-'));
  writeFileSync(path.join(root, 'notes.md'), '');
  mkdirSync(path.join(root, 'docs'));
  writeFileSync(path.join(elsewhere, 'nothing.md'), '');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(elsewhere, { recursive: true, force: true });
});

describe('completeFileReadCommand', () => {
  it('completes the read subcommand', () => {
    expect(completeFileReadCommand(at('file r'), root)?.newInput).toBe('file read ');
    expect(completeFileReadCommand(at('file '), root)?.matches).toEqual(['read']);
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

  it('offers nothing after a subcommand other than read', () => {
    expect(completeFileReadCommand(at('file write no'), root)?.matches).toEqual([]);
  });
});
