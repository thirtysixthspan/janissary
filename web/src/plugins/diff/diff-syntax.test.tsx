import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiffFile, DiffLine } from '@shared/plugins/diff/shared';
import { applySyntaxTheme } from '../../shared/syntax-highlight/themes';
import { createFileTokenizer } from '../../shared/syntax-highlight/file-tokenize';
import { FileEntry } from './FileEntry';

afterEach(() => { document.querySelector('#syntax-theme')?.remove(); });

function line(kind: DiffLine['kind'], text: string, number = 2): DiffLine {
  return { kind, text, number, jump: number, oldNumber: kind === 'added' ? undefined : number };
}

function show(split: boolean, lines: DiffLine[], path = 'a.ts', oldPath?: string) {
  const onOpenLine = vi.fn();
  const file: DiffFile = {
    path, oldPath, additions: 1, deletions: 1,
    hunks: [{ oldStart: 1, newStart: 1, lines: [line('context', '', 1), ...lines] }],
  };
  const view = render(<FileEntry
    file={file} split={split} offset={0} walked={null} onSelectHunk={vi.fn()}
    onOpenFile={vi.fn()} onOpenLine={onOpenLine} onOpenMedia={vi.fn()}
  />);
  return { ...view, onOpenLine };
}

describe.each([false, true])('diff syntax with split=%s', (split) => {
  const rowSelector = split ? '.diff-cell' : '.diff-line';

  it.each([
    ['a.js', 'const value = 1;', 'hljs-keyword'],
    ['a.ts', 'const value: number = 1;', 'hljs-built_in'],
    ['a.json', '{"value": 1}', 'hljs-attr'],
    ['a.md', '# Heading', 'hljs-section'],
  ])('matches the editor token scopes for %s', (path, text, expectedScope) => {
    const { container } = show(split, [line('added', text)], path);
    const code = container.querySelector(`${rowSelector}.diff-added .diff-text`)!;
    expect(code.textContent).toBe(text);
    expect(code.querySelector(`.${expectedScope}`)).not.toBeNull();
    const expected = createFileTokenizer()(`\n${text}`, path)[1];
    expect([...code.querySelectorAll('[class]')].map((node) => node.className))
      .toEqual(expected.map((token) => token.scope));
  });

  it('keeps syntax colors and intraline marks on the same characters', () => {
    const { container } = show(split, [line('removed', 'const value = 30;'), line('added', 'const value = 60;')]);
    const old = container.querySelector(`${rowSelector}.diff-removed .diff-text`)!;
    const next = container.querySelector(`${rowSelector}.diff-added .diff-text`)!;
    expect(old.textContent).toBe('const value = 30;');
    expect(next.textContent).toBe('const value = 60;');
    expect(old.querySelector('.diff-changed.hljs-number')?.textContent).toBe('3');
    expect(next.querySelector('.diff-changed.hljs-number')?.textContent).toBe('6');
    expect(next.querySelector('.hljs-keyword')?.textContent).toBe('const');
    expect(container.querySelector('.hljs')).toBeNull();
  });

  it('highlights multiline constructs independently on the original and modified sides', () => {
    const { container } = show(split, [
      line('removed', '/*'), line('removed', 'old comment */', 3),
      line('added', 'const value = 1;'), line('added', 'const next = 2;', 3),
      line('context', 'const tail = 3;', 4),
    ]);
    const removed = container.querySelectorAll(`${rowSelector}.diff-removed .diff-text`);
    expect(removed[0].querySelector('.hljs-comment')?.textContent).toBe('/*');
    expect(removed[1].querySelector('.hljs-comment')?.textContent).toBe('old comment */');
    const added = container.querySelectorAll(`${rowSelector}.diff-added .diff-text`);
    for (const text of added) {
      expect(text.querySelector('.hljs-comment')).toBeNull();
      expect(text.querySelector('.hljs-keyword')?.textContent).toBe('const');
    }
    const contexts = container.querySelectorAll(`${rowSelector}.diff-context .hljs-keyword`);
    expect(contexts).toHaveLength(split ? 2 : 1);
  });

  it('uses each renamed side\'s extension and leaves unsupported text plain', () => {
    const text = 'const value = 1;';
    const { container } = show(split, [line('removed', text), line('added', text)], 'new.ts', 'old.txt');
    expect(container.querySelector(`${rowSelector}.diff-removed [class^="hljs-"]`)).toBeNull();
    expect(container.querySelector(`${rowSelector}.diff-added .hljs-keyword`)?.textContent).toBe('const');
  });

  it('preserves whitespace, literal markup, and line targeting through token spans', () => {
    const text = '\tconst value = "<b>  &  </b>";  ';
    const { container, onOpenLine } = show(split, [line('removed', text), line('added', text)]);
    const old = container.querySelector(`${rowSelector}.diff-removed .diff-text`)!;
    const next = container.querySelector(`${rowSelector}.diff-added .diff-text`)!;
    expect(next.textContent).toBe(text);
    expect(old.textContent).toBe(text);
    expect(next.querySelector('b')).toBeNull();
    fireEvent.doubleClick(old.querySelector('.hljs-string')!);
    expect(onOpenLine).not.toHaveBeenCalled();
    fireEvent.doubleClick(next.querySelector('.hljs-string')!);
    expect(onOpenLine).toHaveBeenCalledWith(expect.objectContaining({ number: 2, jump: 2 }));
    const selection = globalThis.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(next);
    selection.removeAllRanges();
    selection.addRange(range);
    expect(selection.toString()).toBe(text);
    selection.removeAllRanges();
  });

  it('uses the active editor theme and responds to a theme switch', () => {
    applySyntaxTheme('github-dark');
    const { container } = show(split, [line('added', 'const value = 1;')]);
    const keyword = container.querySelector(`${rowSelector}.diff-added .hljs-keyword`)!;
    const original = getComputedStyle(keyword).color;
    expect(original).toBe('rgb(255, 123, 114)');
    applySyntaxTheme('nord');
    expect(getComputedStyle(keyword).color).toBe('rgb(129, 161, 193)');
    expect(container.querySelector('#syntax-theme')).toBeNull();
    expect(document.querySelector('#syntax-theme')).not.toBeNull();
    expect(keyword.closest(rowSelector)?.classList.contains('diff-added')).toBe(true);
  });
});
