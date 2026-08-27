import { describe, expect, it } from 'vitest';
import type { EditorPluginRequest, EditorPluginResult } from '../api';
import { applyPluginResult } from '../apply-edits';
import type { EditorState } from '../../model';
import { syntaxForFile } from './syntax';
import { toggleComments } from './toggle';

const SLASHES = { kind: 'line', marker: '//' } as const;
const HTML_BLOCK = { kind: 'block', open: '<!--', close: '-->' } as const;

function stateOf(text: string): EditorState {
  return { lines: text.split('\n'), cursor: { line: 0, col: 0 }, anchor: null };
}

// Builds the request the host would build for a whole-line selection over `from`..`to`.
function request(text: string, from: number, to: number, file = 'a.ts'): EditorPluginRequest {
  const lines = text.split('\n');
  return {
    command: 'toggle-comment',
    file,
    selection: { anchor: { line: from, col: 0 }, cursor: { line: to, col: lines[to].length } },
    range: { start: { line: from, col: 0 }, end: { line: to, col: lines[to].length } },
    lines: lines.slice(from, to + 1),
  };
}

function caretRequest(text: string, line: number, col: number, file = 'a.ts'): EditorPluginRequest {
  const lines = text.split('\n');
  return {
    command: 'toggle-comment',
    file,
    selection: { anchor: null, cursor: { line, col } },
    range: { start: { line, col: 0 }, end: { line, col: lines[line].length } },
    lines: [lines[line]],
  };
}

// The toggle only ever describes edits, so every assertion runs them through the real applier.
function applied(text: string, result: EditorPluginResult | null): string {
  expect(result).not.toBeNull();
  const outcome = applyPluginResult(stateOf(text), result as EditorPluginResult);
  expect(outcome.ok, outcome.ok ? '' : outcome.reason).toBe(true);
  return outcome.ok ? outcome.state.lines.join('\n') : '';
}

describe('toggleComments — line languages', () => {
  it('comments and uncomments a single line', () => {
    const text = 'const a = 1;';
    const commented = applied(text, toggleComments(caretRequest(text, 0, 3), SLASHES));
    expect(commented).toBe('// const a = 1;');
    expect(applied(commented, toggleComments(caretRequest(commented, 0, 3), SLASHES))).toBe(text);
  });

  it('round-trips a multi-line range exactly through two presses', () => {
    const text = 'const a = 1;\nconst b = 2;\nconst c = 3;';
    const once = applied(text, toggleComments(request(text, 0, 2), SLASHES));
    expect(once).toBe('// const a = 1;\n// const b = 2;\n// const c = 3;');
    expect(applied(once, toggleComments(request(once, 0, 2), SLASHES))).toBe(text);
  });

  it('comments every line of a mixed range, and the inverse restores it', () => {
    const text = '// const a = 1;\nconst b = 2;';
    const once = applied(text, toggleComments(request(text, 0, 1), SLASHES));
    expect(once).toBe('// // const a = 1;\n// const b = 2;');
    expect(applied(once, toggleComments(request(once, 0, 1), SLASHES))).toBe(text);
  });

  it('comments blank lines inside the range and excludes them from the direction test', () => {
    const text = 'const a = 1;\n\nconst b = 2;';
    const once = applied(text, toggleComments(request(text, 0, 2), SLASHES));
    expect(once).toBe('// const a = 1;\n// \n// const b = 2;');

    // Every non-blank line carries a marker, so the blank between them does not block uncommenting.
    expect(applied(once, toggleComments(request(once, 0, 2), SLASHES))).toBe(text);
  });

  it('places the marker at the shallowest common indent, preserving relative indentation', () => {
    const text = '  if (x) {\n      deep();\n  }';
    const once = applied(text, toggleComments(request(text, 0, 2), SLASHES));
    expect(once).toBe('  // if (x) {\n  //     deep();\n  // }');
    expect(applied(once, toggleComments(request(once, 0, 2), SLASHES))).toBe(text);
  });

  it('pads a line shorter than the common indent out to the marker column', () => {
    const text = '    a();\n\n    b();';
    expect(applied(text, toggleComments(request(text, 0, 2), SLASHES)))
      .toBe('    // a();\n    // \n    // b();');
  });

  it('uncomments a marker written without a following space', () => {
    const text = '//const a = 1;';
    expect(applied(text, toggleComments(request(text, 0, 0), SLASHES))).toBe('const a = 1;');
  });

  it('uncomments a marker sitting at an unexpected column', () => {
    const text = 'const a = 1;\n      // const b = 2;';
    const once = applied(text, toggleComments(request(text, 1, 1), SLASHES));
    expect(once).toBe('const a = 1;\n      const b = 2;');
  });

  it('returns a selection covering the same whole lines', () => {
    const text = 'const a = 1;\nconst b = 2;';
    const result = toggleComments(request(text, 0, 1), SLASHES);
    expect(result?.selection).toEqual({
      anchor: { line: 0, col: 0 },
      cursor: { line: 1, col: '// const b = 2;'.length },
    });
  });

  it('leaves a bare caret on its line, shifted by the marker width', () => {
    const text = 'const a = 1;';
    const result = toggleComments(caretRequest(text, 0, 6), SLASHES);
    expect(result?.selection).toEqual({ anchor: null, cursor: { line: 0, col: 9 } });
  });

  it('emits absolute document coordinates for a range that does not start at line 0', () => {
    const text = 'a();\nb();\nc();';
    const result = toggleComments(request(text, 1, 2), SLASHES);
    expect(result?.edits.map((edit) => edit.start.line)).toEqual([1, 2]);
    expect(applied(text, result)).toBe('a();\n// b();\n// c();');
  });
});

describe('toggleComments — block languages', () => {
  it('wraps the whole range in one pair and unwraps it', () => {
    const text = 'one\ntwo\nthree';
    const once = applied(text, toggleComments(request(text, 0, 2, 'a.md'), HTML_BLOCK));
    expect(once).toBe('<!-- one\ntwo\nthree -->');
    expect(applied(once, toggleComments(request(once, 0, 2, 'a.md'), HTML_BLOCK))).toBe(text);
  });

  it('wraps and unwraps a single line', () => {
    const text = 'a note';
    const once = applied(text, toggleComments(request(text, 0, 0, 'a.md'), HTML_BLOCK));
    expect(once).toBe('<!-- a note -->');
    expect(applied(once, toggleComments(request(once, 0, 0, 'a.md'), HTML_BLOCK))).toBe(text);
  });

  it('wraps again when a stray marker sits inside the range rather than wrapping it', () => {
    const text = 'one\n<!-- two -->\nthree';
    expect(applied(text, toggleComments(request(text, 0, 2, 'a.md'), HTML_BLOCK)))
      .toBe('<!-- one\n<!-- two -->\nthree -->');
  });

  it('keeps the wrapped range selected so the second press is the exact inverse', () => {
    const text = 'one\ntwo';
    const result = toggleComments(request(text, 0, 1, 'a.md'), HTML_BLOCK);
    expect(result?.selection).toEqual({
      anchor: { line: 0, col: 0 },
      cursor: { line: 1, col: 'two -->'.length },
    });
  });
});

describe('toggleComments — languages resolved from the file name', () => {
  it('uses each language\'s own marker', () => {
    const cases = [
      { file: 'a.rb', text: 'puts 1', expected: '# puts 1' },
      { file: 'a.py', text: 'print(1)', expected: '# print(1)' },
      { file: 'a.sh', text: 'ls', expected: '# ls' },
      { file: 'a.css', text: 'a {}', expected: '/* a {} */' },
      { file: 'a.html', text: '<p>', expected: '<!-- <p> -->' },
    ];
    for (const { file, text, expected } of cases) {
      const syntax = syntaxForFile(file);
      expect(syntax, file).not.toBeNull();
      expect(applied(text, toggleComments(request(text, 0, 0, file), syntax!)), file).toBe(expected);
    }
  });
});
