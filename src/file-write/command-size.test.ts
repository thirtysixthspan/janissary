import { describe, it, expect } from 'vitest';
import { FILE_POLICY_MAX_BYTES } from '../file-read/policy.js';
import { FILE_EDIT_USAGE, FILE_WRITE_USAGE, parseFileMutation } from './command.js';

function writeArgument(path: string, totalBytes: number, filler = 'a'): string {
  const prefix = JSON.stringify({ path, content: '' }).slice(0, -2);
  const fillerBytes = Buffer.byteLength(filler, 'utf8');
  const remaining = totalBytes - Buffer.byteLength(prefix, 'utf8') - 2;
  const repeats = Math.floor(remaining / fillerBytes);
  const padding = 'a'.repeat(remaining - repeats * fillerBytes);
  return `${prefix}${filler.repeat(repeats)}${padding}"}`;
}

describe('parseFileMutation argument size limit', () => {
  it('accepts an argument of exactly 5 MiB', () => {
    const argument = writeArgument('a.txt', FILE_POLICY_MAX_BYTES);
    expect(Buffer.byteLength(argument, 'utf8')).toBe(FILE_POLICY_MAX_BYTES);
    expect(parseFileMutation(`file write ${argument}`)).toMatchObject({ kind: 'write', path: 'a.txt' });
  });

  it('rejects a write one byte over as too large', () => {
    const argument = writeArgument('a.txt', FILE_POLICY_MAX_BYTES + 1);
    expect(parseFileMutation(`file write ${argument}`)).toEqual({ error: 'File too large (>5 MB): a.txt.' });
  });

  it('rejects an oversized edit as too large', () => {
    const line = `file edit ${JSON.stringify({ path: 'b.txt', oldString: 'y', newString: 'x'.repeat(FILE_POLICY_MAX_BYTES) })}`;
    expect(parseFileMutation(line)).toEqual({ error: 'File too large (>5 MB): b.txt.' });
  });

  it('returns usage for an oversized malformed argument', () => {
    const big = 'x'.repeat(FILE_POLICY_MAX_BYTES + 1);
    expect(parseFileMutation(`file write {"path":"a","content":"${big}"`)).toEqual({ error: FILE_WRITE_USAGE });
    expect(parseFileMutation(`file edit {"path":"a","newString":"${big}"}`)).toEqual({ error: FILE_EDIT_USAGE });
  });

  it('counts multi-byte characters by UTF-8 bytes', () => {
    const argument = writeArgument('a.txt', FILE_POLICY_MAX_BYTES + 3, String.fromCodePoint(0xe9));
    expect(argument.length).toBeLessThan(FILE_POLICY_MAX_BYTES);
    expect(parseFileMutation(`file write ${argument}`)).toEqual({ error: 'File too large (>5 MB): a.txt.' });
  });

  it('escapes the path through displayPath', () => {
    const argument = writeArgument('a\tb.txt', FILE_POLICY_MAX_BYTES + 1);
    expect(parseFileMutation(`file write ${argument}`)).toEqual({ error: String.raw`File too large (>5 MB): a\tb.txt.` });
  });
});
