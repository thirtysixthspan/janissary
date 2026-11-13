import { describe, it, expect } from 'vitest';
import {
  FILE_MUTATION_PRIMER,
  isFileEditCommandLine,
  isFileMutationCommandLine,
  isFileWriteCommandLine,
} from './command.js';

describe('mutation command line recognition', () => {
  it('recognizes write and edit lines whether or not their JSON is valid', () => {
    expect(isFileWriteCommandLine('file write {not json')).toBe(true);
    expect(isFileEditCommandLine('file edit')).toBe(true);
    expect(isFileEditCommandLine('FILE EDIT {}')).toBe(true);
  });

  it('rejects other commands, missing whitespace, and a leading slash', () => {
    expect(isFileMutationCommandLine('file read a.md')).toBe(false);
    expect(isFileMutationCommandLine('filewrite {}')).toBe(false);
    expect(isFileMutationCommandLine('file write{}')).toBe(false);
    expect(isFileMutationCommandLine('/file write {}')).toBe(false);
  });

  it('accepts either subcommand as a mutation line', () => {
    expect(isFileMutationCommandLine('file write {}')).toBe(true);
    expect(isFileMutationCommandLine('file edit {}')).toBe(true);
    expect(isFileWriteCommandLine('file edit {}')).toBe(false);
  });
});

describe('FILE_MUTATION_PRIMER', () => {
  it('shows both command forms and the optional fields', () => {
    expect(FILE_MUTATION_PRIMER).toContain('file write {');
    expect(FILE_MUTATION_PRIMER).toContain('file edit {');
    expect(FILE_MUTATION_PRIMER).toContain('replaceAll');
    expect(FILE_MUTATION_PRIMER).toContain('expectedHash');
    expect(FILE_MUTATION_PRIMER.split('\n')).toHaveLength(6);
  });
});
