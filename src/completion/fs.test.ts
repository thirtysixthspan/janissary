import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { completeFilePath } from './fs.js';
import { readCompletionCursor } from './cursor.js';

const at = (line: string) => readCompletionCursor(line, line.length);

let root: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'complete-file-path-'));
  mkdirSync(path.join(root, 'docs'));
  writeFileSync(path.join(root, 'dogs.md'), '');
  mkdirSync(path.join(root, '.config'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('completeFilePath', () => {
  it('keeps only directories when directoriesOnly is set and appends a slash to the unique match', () => {
    const result = completeFilePath(at('cd do'), root, { directoriesOnly: true });
    expect(result.matches).toEqual(['docs']);
    expect(result.newInput).toBe('cd docs/');
  });

  it('offers a hidden directory only when the typed name starts with a dot', () => {
    expect(completeFilePath(at('cd '), root, { directoriesOnly: true }).matches).toEqual(['docs']);
    expect(completeFilePath(at('cd .c'), root, { directoriesOnly: true }).newInput).toBe('cd .config/');
  });

  it('offers files and directories without the option', () => {
    const result = completeFilePath(at('cd do'), root);
    expect(result.matches).toEqual(['docs', 'dogs.md']);
    expect(result.newInput).toBe('cd do');
  });
});
