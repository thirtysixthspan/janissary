import { describe, it, expect } from 'vitest';
import {
  describeLoopCommand,
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

describe('describeLoopCommand', () => {
  it('labels a write and an edit by path only', () => {
    expect(describeLoopCommand('file write {"path":"a/b.md","content":"body"}')).toBe('file write a/b.md');
    expect(describeLoopCommand('file edit {"path":"c.md","oldString":"x","newString":"y"}')).toBe('file edit c.md');
  });

  it('falls back to the bare subcommand when the JSON is malformed', () => {
    expect(describeLoopCommand('file write {"path":"a.md","content":')).toBe('file write');
    expect(describeLoopCommand('file edit')).toBe('file edit');
  });

  it('escapes control characters in the path', () => {
    expect(describeLoopCommand(String.raw`file write {"path":"a\nb.md","content":""}`)).not.toContain('\n');
  });

  it('returns other commands unchanged', () => {
    expect(describeLoopCommand('file read notes.md')).toBe('file read notes.md');
    expect(describeLoopCommand('db sqlite query movies SELECT 1')).toBe('db sqlite query movies SELECT 1');
  });
});

describe('FILE_MUTATION_PRIMER', () => {
  it('shows both command forms and only the options an agent can use', () => {
    expect(FILE_MUTATION_PRIMER).toContain('file write {');
    expect(FILE_MUTATION_PRIMER).toContain('file edit {');
    expect(FILE_MUTATION_PRIMER).toContain('replaceAll');
    expect(FILE_MUTATION_PRIMER).toContain('creates missing parent folders.');
    expect(FILE_MUTATION_PRIMER).not.toContain('expectedHash');
    expect(FILE_MUTATION_PRIMER.split('\n')).toHaveLength(6);
  });
});
