import { describe, expect, it } from 'vitest';
import type { EditorPluginRequest, EditorPluginResult } from '../api';
import run from './index';
import { syntaxForFile } from './syntax';

function request(file: string, line = 'value'): EditorPluginRequest {
  return {
    command: 'toggle-comment',
    file,
    selections: [{ anchor: null, cursor: { line: 0, col: 0 } }],
    range: { start: { line: 0, col: 0 }, end: { line: 0, col: line.length } },
    lines: [line],
  };
}

describe('syntaxForFile', () => {
  it('resolves every shipped extension to its marker', () => {
    const slashes = ['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'mts', 'cts', 'json'];
    for (const extension of slashes) {
      expect(syntaxForFile(`a.${extension}`), extension).toEqual({ kind: 'line', marker: '//' });
    }

    const hashes = ['rb', 'sh', 'bash', 'zsh', 'txt', 'py', 'yml', 'yaml'];
    for (const extension of hashes) {
      expect(syntaxForFile(`a.${extension}`), extension).toEqual({ kind: 'line', marker: '#' });
    }

    for (const extension of ['md', 'markdown', 'html']) {
      expect(syntaxForFile(`a.${extension}`), extension)
        .toEqual({ kind: 'block', open: '<!--', close: '-->' });
    }

    expect(syntaxForFile('a.css')).toEqual({ kind: 'block', open: '/*', close: '*/' });
  });

  it('matches case-insensitively', () => {
    expect(syntaxForFile('README.MD')).toEqual({ kind: 'block', open: '<!--', close: '-->' });
    expect(syntaxForFile('Main.TS')).toEqual({ kind: 'line', marker: '//' });
  });

  it('answers null for an unknown extension and for a file with none', () => {
    expect(syntaxForFile('server.log')).toBeNull();
    expect(syntaxForFile('Makefile')).toBeNull();
    expect(syntaxForFile('')).toBeNull();
  });

  it('reads the extension after the last dot', () => {
    expect(syntaxForFile('component.test.ts')).toEqual({ kind: 'line', marker: '//' });
  });
});

describe('commenting handler', () => {
  it('returns edits for a file it knows', () => {
    const result = run(request('a.ts', 'const a = 1;')) as EditorPluginResult | null;
    expect(result).not.toBeNull();
    expect(result?.edits).toHaveLength(1);
  });

  it('returns null for a file it does not know, so the press is a silent no-op', () => {
    expect(run(request('server.log'))).toBeNull();
    expect(run(request('Makefile'))).toBeNull();
  });
});
