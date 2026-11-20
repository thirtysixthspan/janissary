import { describe, it, expect } from 'vitest';
import {
  describeLoopCommand,
  FILE_MUTATION_PRIMER,
  isFileEditCommandLine,
  isFileMutationCommandLine,
  isFileWriteCommandLine,
  parseFileMutation,
} from './command.js';
import { describePatchCommand } from '../file-patch/command.js';

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

  it('accepts a patch line and rejects its lookalikes', () => {
    expect(isFileMutationCommandLine('file patch {"patchText":"x"}')).toBe(true);
    expect(isFileMutationCommandLine('FILE PATCH {"patchText":"x"}')).toBe(true);
    expect(isFileMutationCommandLine('file patch')).toBe(true);
    expect(isFileMutationCommandLine('file patching x')).toBe(false);
    expect(isFileMutationCommandLine('/file patch {}')).toBe(false);
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

  it('describes a patch by its section paths and moves without its content', () => {
    const patch = [
      '*** Add File: a.md', '+SECRET ADD',
      '*** Update File: src/a.ts', '@@', '-old', '+SECRET LINE',
      '*** Update File: src/x.ts', '*** Move to: src/y.ts', '@@', '-old', '+SECRET MOVE',
      '*** Delete File: old.txt',
    ].join('\n');
    const line = `file patch ${JSON.stringify({ patchText: patch })}`;

    expect(describeLoopCommand(line)).toBe(describePatchCommand(line));
    expect(describeLoopCommand(line)).toBe('file patch a.md, src/a.ts, src/x.ts -> src/y.ts, old.txt');
    expect(describeLoopCommand(line)).not.toContain('+');
    expect(describeLoopCommand(line)).not.toContain('SECRET');
  });

  it('falls back to the bare patch command when the patch line is malformed', () => {
    expect(describeLoopCommand('file patch {')).toBe('file patch');
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
    expect(FILE_MUTATION_PRIMER.split('\n')).toHaveLength(9);
    expect(FILE_MUTATION_PRIMER).toContain('inside a final fenced block whose info string is exactly `janissary`');
    expect(FILE_MUTATION_PRIMER).not.toContain('end your reply with one line');
  });

  it('explains escaping, shows a new-file example, and names the replies', () => {
    expect(FILE_MUTATION_PRIMER).toContain(String.raw`Inside JSON strings escape " as \" and \ as \\.`);
    expect(FILE_MUTATION_PRIMER).toContain(String.raw`file write {"path":"notes/todo.md","content":"# Todo\n- first item\n"}`);
    expect(FILE_MUTATION_PRIMER).toContain('`Wrote <path>.`');
    expect(FILE_MUTATION_PRIMER).toContain('`Edited <path> (<n> replacements).`');
  });

  it('gives an example line that parses as a write creating the named file', () => {
    const example = FILE_MUTATION_PRIMER.split('\n').find((line) => line.startsWith('Example'))!;
    const command = example.slice(example.indexOf('file write'));
    expect(parseFileMutation(command)).toEqual({ kind: 'write', path: 'notes/todo.md', content: '# Todo\n- first item\n' });
  });
});
