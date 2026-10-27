import { describe, it, expect } from 'vitest';
import { parseFileNavigatorArgs } from './args.js';

function expectOpen(rest: string, expected: Record<string, unknown>): void {
  const defined = Object.fromEntries(Object.entries(expected).filter(([, value]) => value !== undefined));
  expect(parseFileNavigatorArgs(rest)).toMatchObject({ kind: 'open', ...defined });
}

describe('parseFileNavigatorArgs', () => {
  it('leaves details unset when no with clause is given', () => {
    expectOpen('src', { dock: null, details: undefined, steps: [], target: 'src' });
  });

  it('parses each of the four detail modes', () => {
    for (const mode of ['name', 'size', 'modified', 'permissions'] as const) {
      expectOpen(`with ${mode}`, { details: mode, target: '' });
    }
  });

  it('accepts the with clause in either order relative to in and on', () => {
    expectOpen('with size on left src', { dock: 'left', details: 'size', target: 'src' });
    expectOpen('in claude on right with modified', {
      inLabel: 'claude', dock: 'right', details: 'modified', target: '',
    });
  });

  it('consumes the with clause at most once, leaving a repeat in the target', () => {
    expectOpen('with size with modified', { dock: null, details: 'size', target: 'with modified' });
  });

  it('leaves an unrecognized mode word in the path target', () => {
    expectOpen('with foo', { dock: null, details: undefined, target: 'with foo' });
    expectOpen('with-notes', { target: 'with-notes' });
  });

  it('keeps the existing in/on/left/right behavior', () => {
    expectOpen('left', { dock: 'left', target: '' });
    expectOpen('in claude', { inLabel: 'claude', dock: null, target: '' });
    expectOpen('./left', { dock: null, target: './left' });
  });

  it('parses a path before the in clause', () => {
    expectOpen('src/sub in claude', { inLabel: 'claude', dock: null, target: 'src/sub' });
  });

  it('preserves a trailing backslash in an unquoted single-token path', () => {
    expectOpen('folder\\', { target: 'folder\\' });
    expectOpen('on left folder\\', { dock: 'left', target: 'folder\\' });
  });

  it('decodes quoted labels with spaces and escaped quotes before a path', () => {
    expectOpen('in "review team" src', { inLabel: 'review team', target: 'src' });
    expectOpen(String.raw`in "review \"team\"" src`, { inLabel: 'review "team"', target: 'src' });
  });

  it('decodes quoted labels with spaces and escaped quotes after a path', () => {
    expectOpen('src in "review team"', { inLabel: 'review team', target: 'src' });
    expectOpen(String.raw`src in "review \"team\""`, { inLabel: 'review "team"', target: 'src' });
  });

  it('reports a trailing in clause without a label', () => {
    expectOpen('src/sub in', { inLabel: undefined, missingInLabel: true, dock: null, target: 'src/sub' });
  });

  it('parses view clauses in order beside the existing clauses', () => {
    expectOpen('in claude on left with size expand src cursor src/a.ts anchor src/a.ts select src/a.ts collapse docs', {
      inLabel: 'claude', dock: 'left', details: 'size', target: '',
      steps: [
        { kind: 'expand', path: 'src' },
        { kind: 'cursor', path: 'src/a.ts' },
        { kind: 'anchor', path: 'src/a.ts' },
        { kind: 'select', path: 'src/a.ts' },
        { kind: 'collapse', path: 'docs' },
      ],
    });
  });

  it('parses view clauses alone and after a leading bare side word', () => {
    expectOpen('expand src select src/a.ts', {
      dock: null,
      steps: [{ kind: 'expand', path: 'src' }, { kind: 'select', path: 'src/a.ts' }],
      target: '',
    });
    expectOpen('left with size expand src', {
      dock: 'left', details: 'size', steps: [{ kind: 'expand', path: 'src' }], target: '',
    });
    expectOpen('left on right cursor src/a.ts', {
      dock: 'right', steps: [{ kind: 'cursor', path: 'src/a.ts' }], target: '',
    });
  });

  it('allows repeated view clauses and uses only bare words as keywords', () => {
    expectOpen('expand src expand docs cursor a.ts cursor b.ts select a.ts select b.ts', {
      steps: [
        { kind: 'expand', path: 'src' }, { kind: 'expand', path: 'docs' },
        { kind: 'cursor', path: 'a.ts' }, { kind: 'cursor', path: 'b.ts' },
        { kind: 'select', path: 'a.ts' }, { kind: 'select', path: 'b.ts' },
      ],
      target: '',
    });
    expectOpen('"select notes"', { steps: [], target: 'select notes' });
    expectOpen('"expand"', { steps: [], target: 'expand' });
  });

  it('reads single- and double-quoted clause paths, including escaped quotes', () => {
    expectOpen(String.raw`expand 'my dir' select 'it\'s.md' cursor "a \"quote\".ts"`, {
      steps: [
        { kind: 'expand', path: 'my dir' },
        { kind: 'select', path: "it's.md" },
        { kind: 'cursor', path: 'a "quote".ts' },
      ],
      target: '',
    });
  });

  it('leaves a keyword with no value as the path', () => {
    expectOpen('expand', { steps: [], target: 'expand' });
    expectOpen('select', { steps: [], target: 'select' });
    expectOpen('print', { steps: [], target: 'print' });
  });

  it('unwraps exactly one quoted trailing path and keeps a multiword path verbatim', () => {
    expectOpen('expand "a b" "c d"', {
      steps: [{ kind: 'expand', path: 'a b' }], target: 'c d',
    });
    expectOpen('my dir', { target: 'my dir' });
    expectOpen('"select notes" in claude', { inLabel: 'claude', target: 'select notes' });
  });

  it('preserves quote marks opened inside a trailing path', () => {
    expectOpen('my"folder"', { target: 'my"folder"' });
    expectOpen('my"folder" in claude', { inLabel: 'claude', target: 'my"folder"' });
  });

  it('reports an unterminated clause quote but leaves an unterminated trailing path alone', () => {
    expect(parseFileNavigatorArgs('expand "src')).toEqual({
      kind: 'error', error: 'files: unterminated quote',
    });
    expectOpen('"unfinished', { target: '"unfinished' });
  });

  it('parses print only as the first bare word and validates its single tab name', () => {
    expect(parseFileNavigatorArgs('print navigator')).toEqual({ kind: 'print', name: 'navigator' });
    expect(parseFileNavigatorArgs('print "review notes"')).toEqual({ kind: 'print', name: 'review notes' });
    expect(parseFileNavigatorArgs('print')).toMatchObject({ kind: 'open', target: 'print' });
    expect(parseFileNavigatorArgs('expand src print navigator')).toMatchObject({ kind: 'open', target: 'print navigator' });
    expect(parseFileNavigatorArgs('print a b')).toEqual({ kind: 'error', error: 'Usage: files print <tab>.' });
    expect(parseFileNavigatorArgs('print "unfinished')).toEqual({ kind: 'error', error: 'files: unterminated quote' });
  });
});
