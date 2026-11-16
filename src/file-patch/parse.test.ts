import { describe, expect, it } from 'vitest';
import { parsePatchText } from './parse.js';

describe('parsePatchText', () => {
  it('parses sections in order and preserves content and raw update lines', () => {
    expect(parsePatchText([
      '*** Begin Patch', '*** Add File:  a b  ', '+  first \t', '+', '*** Delete File: old',
      '*** Update File: x', '*** Move to: y', '@@', '', '*** End of File', '*** End Patch',
    ].join('\n'))).toEqual({ sections: [
      { kind: 'add', path: 'a b', line: 2, lines: ['  first \t', ''] },
      { kind: 'delete', path: 'old', line: 5 },
      { kind: 'update', path: 'x', line: 6, moveTo: 'y', bodyLines: [
        { line: 8, text: '@@' }, { line: 9, text: '' }, { line: 10, text: '*** End of File' },
      ] },
    ] });
  });

  it.each([
    '*** Add File: x\n+hi',
    '*** Begin Patch\n*** Add File: x\n+hi',
    '*** Add File: x\n+hi\n*** End Patch',
    '*** Begin Patch\n*** Add File: x\n+hi\n*** End Patch\n',
  ])('accepts optional envelopes: %s', (text) => {
    const result = parsePatchText(text);
    expect('sections' in result && result.sections[0]).toMatchObject({ kind: 'add', path: 'x', lines: ['hi'] });
  });

  it('accepts empty adds, file markers within a body, and unvalidated paths', () => {
    expect(parsePatchText('*** Add File: ../x\n*** Add File: /x\n+ok')).toEqual({ sections: [
      { kind: 'add', path: '../x', line: 1, lines: [] },
      { kind: 'add', path: '/x', line: 2, lines: ['ok'] },
    ] });
  });

  it('treats CRLF like LF and retains a lone final carriage return', () => {
    const text = '*** Begin Patch\n*** Add File: x\n+hi\n*** End Patch\n';
    expect(parsePatchText(text.replaceAll('\n', '\r\n'))).toEqual(parsePatchText(text));
    expect(parsePatchText('*** Add File: x\n+hi\r')).toEqual({
      sections: [{ kind: 'add', path: 'x', line: 1, lines: ['hi\r'] }],
    });
  });

  it.each(['', '*** Begin Patch\n*** End Patch'])('reports no sections for %j', (text) => {
    expect(parsePatchText(text)).toEqual({ error: { line: 1, problem: 'no file sections' } });
  });

  it.each([
    ['\n', 1, 'unknown marker ""'],
    ['*** Rename File: x', 1, 'unknown marker "*** Rename File: x"'],
    ['hello', 1, 'unknown marker "hello"'],
    ['*** Delete File: x\nhello', 2, 'unknown marker "hello"'],
    ['*** Add File: x\nhello', 2, 'Add File lines must start with "+"'],
    ['*** Add File: x\n\n+x', 2, 'Add File lines must start with "+"'],
    ['*** Add File: x\n*** End of File', 2, 'unknown marker "*** End of File"'],
    ['*** Update File: x\n*** Strange', 2, 'unknown marker "*** Strange"'],
    ['*** Add File:', 1, 'missing path'],
    ['*** Delete File: ', 1, 'missing path'],
    ['*** Update File: ', 1, 'missing path'],
    ['*** Update File: x\n*** Move to:', 2, 'missing path'],
    ['*** Move to:', 1, 'Move to must follow Update File'],
    ['*** Add File: x\n*** Move to: y', 2, 'Move to must follow Update File'],
    ['*** Delete File: x\n*** Move to: y', 2, 'Move to must follow Update File'],
    ['*** Update File: x\n@@\n*** Move to: y', 3, 'Move to must follow Update File'],
    ['*** Update File: x\n*** Move to: y\n*** Move to: z', 3, 'Move to must follow Update File'],
    ['*** Add File:foo', 1, 'unknown marker "*** Add File:foo"'],
    ['*** add file: x', 1, 'unknown marker "*** add file: x"'],
    ['*** Begin Patch ', 1, 'unknown marker "*** Begin Patch "'],
    ['*** Add File: x\n*** Begin Patch', 2, 'unknown marker "*** Begin Patch"'],
    ['*** Add File: x\n*** End Patch\n\n', 2, 'unknown marker "*** End Patch"'],
  ])('reports first error for %j', (text, line, problem) => {
    expect(parsePatchText(text)).toEqual({ error: { line, problem } });
    expect(parsePatchText(`*** Begin Patch\n${text}`)).toEqual({ error: { line: line + 1, problem } });
  });
});
