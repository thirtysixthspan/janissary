import { describe, expect, it } from 'vitest';
import { FILE_POLICY_MAX_BYTES } from '../file-read/policy.js';
import {
  describePatchCommand, FILE_PATCH_PRIMER, isFilePatchCommandLine, parseFilePatchCommand,
} from './command.js';
import { parsePatchText } from './parse.js';

function patchArgument(totalBytes: number, filler = 'a'): string {
  const prefix = '{"patchText":"';
  const remaining = totalBytes - Buffer.byteLength(prefix) - 2;
  const count = Math.floor(remaining / Buffer.byteLength(filler));
  return `${prefix}${filler.repeat(count)}${'a'.repeat(remaining - count * Buffer.byteLength(filler))}"}`;
}

function command(patchText: string): string {
  return `file patch ${JSON.stringify({ patchText })}`;
}

describe('file patch command', () => {
  it.each(['file patch {}', 'FILE PATCH {}', 'file\tpatch {}', 'file patch'])('recognizes %s', (line) => {
    expect(isFilePatchCommandLine(line)).toBe(true);
  });

  it.each(['file patching', 'file write {}'])('does not recognize %s', (line) => {
    expect(isFilePatchCommandLine(line)).toBe(false);
  });

  it.each([
    'file patch', 'file patch   ', 'file patch {', 'file patch []', 'file patch "text"',
    'file patch 2', 'file patch null', 'file patch {}', 'file patch {"patchText":2}',
    'file patch {"patchText":"x","other":1}', 'file patch {"patchText":"x","__proto__":{}}',
    'file write {}',
  ])('returns usage for %s', (line) => {
    expect(parseFilePatchCommand(line)).toEqual({ error: 'Usage: file patch <JSON>' });
  });

  it('decodes the string and tolerates surrounding whitespace', () => {
    expect(parseFilePatchCommand(`  FILE\tPATCH  ${JSON.stringify({ patchText: 'a\nb' })}  `))
      .toEqual({ patchText: 'a\nb' });
    expect(parseFilePatchCommand(command(''))).toEqual({ patchText: '' });
  });

  it('accepts exactly the size limit and rejects one byte over', () => {
    const exact = patchArgument(FILE_POLICY_MAX_BYTES);
    expect(Buffer.byteLength(exact)).toBe(FILE_POLICY_MAX_BYTES);
    expect(parseFilePatchCommand(`file patch ${exact}`)).toHaveProperty('patchText');
    expect(parseFilePatchCommand(`file patch ${patchArgument(FILE_POLICY_MAX_BYTES + 1)}`))
      .toEqual({ error: 'Patch too large (>5 MB). No files were changed.' });
  });

  it('counts UTF-8 bytes and gives usage before size for malformed JSON', () => {
    const argument = patchArgument(FILE_POLICY_MAX_BYTES + 1, 'é');
    expect(argument.length).toBeLessThan(FILE_POLICY_MAX_BYTES);
    expect(parseFilePatchCommand(`file patch ${argument}`)).toEqual({ error: 'Patch too large (>5 MB). No files were changed.' });
    expect(parseFilePatchCommand(`file patch {"patchText":"${'x'.repeat(FILE_POLICY_MAX_BYTES)}"`))
      .toEqual({ error: 'Usage: file patch <JSON>' });
  });
});

describe('FILE_PATCH_PRIMER', () => {
  it('shows the command form and the reply summary on five lines', () => {
    expect(FILE_PATCH_PRIMER.split('\n')).toHaveLength(5);
    expect(FILE_PATCH_PRIMER).toContain('file patch {"patchText":"<patch>"}');
    expect(FILE_PATCH_PRIMER).toContain('`Patched <n> files:`');
  });

  it('gives an example line that parses as an update and a delete', () => {
    const example = FILE_PATCH_PRIMER.split('\n').find((line) => line.startsWith('Example'))!;
    const command = example.slice(example.indexOf('file patch'));
    const parsedCommand = parseFilePatchCommand(command);
    if ('error' in parsedCommand) throw new Error('expected the example to parse');
    expect(parsePatchText(parsedCommand.patchText)).toMatchObject({
      sections: [
        { kind: 'update', path: 'src/a.ts' },
        { kind: 'delete', path: 'old.txt' },
      ],
    });
    expect(describePatchCommand(command)).toBe('file patch src/a.ts, old.txt');
  });
});

describe('describePatchCommand', () => {
  it('lists section paths and move targets without content', () => {
    const patch = ['*** Add File: a.md', '+secret', '*** Update File: src/a.ts', '@@', '-old', '+new',
      '*** Update File: src/x.ts', '*** Move to: src/y.ts', '*** Delete File: old.txt'].join('\n');
    expect(describePatchCommand(command(patch).replace('file patch', 'FILE PATCH')))
      .toBe('file patch a.md, src/a.ts, src/x.ts -> src/y.ts, old.txt');
    expect(describePatchCommand(command('*** Add File: a\n+x\n*** Delete File: a'))).toBe('file patch a, a');
  });

  it('returns the bare label for invalid or oversized inputs and preserves other commands', () => {
    expect(describePatchCommand('file patch {')).toBe('file patch');
    expect(describePatchCommand(command('*** Bad'))).toBe('file patch');
    expect(describePatchCommand(command(''))).toBe('file patch');
    expect(describePatchCommand(`file patch ${patchArgument(FILE_POLICY_MAX_BYTES + 1)}`)).toBe('file patch');
    expect(describePatchCommand('file read notes.md')).toBe('file read notes.md');
  });

  it('escapes control characters in paths and move targets', () => {
    const description = describePatchCommand(command('*** Update File: a\tb\n*** Move to: c\td'));
    expect(description).toBe(String.raw`file patch a\tb -> c\td`);
    expect(description).not.toContain('\n');
    expect(describePatchCommand(command('*** Update File: a\nb\n*** Move to: c\nd'))).toBe('file patch');
  });
});
