import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiffFile } from '@shared/plugins/diff/shared';
import { FileEntry } from './FileEntry';
import styles from './diff.css?raw';

afterEach(() => { document.querySelector('#diff-test-styles')?.remove(); });

function show(split = true) {
  const sheet = document.createElement('style');
  sheet.id = 'diff-test-styles';
  sheet.textContent = styles;
  document.head.append(sheet);
  const file: DiffFile = {
    path: 'a.ts', additions: 1, deletions: 2,
    hunks: [{ oldStart: 1, newStart: 1, lines: [
      { kind: 'context', number: 1, oldNumber: 1, jump: 1, text: '' },
      { kind: 'removed', number: 2, oldNumber: 2, jump: 2, text: 'const value = 30;' },
      { kind: 'removed', number: 3, oldNumber: 3, jump: 2, text: 'const extra = 2;' },
      { kind: 'added', number: 2, jump: 2, text: 'const value = 60;' },
    ] }],
  };
  return render(<div className="diff-body"><FileEntry
    file={file} split={split} offset={0} walked={null} onSelectHunk={vi.fn()}
    onOpenFile={vi.fn()} onOpenLine={vi.fn()} onOpenMedia={vi.fn()}
  /></div>);
}

function declaredStyle(element: Element, property: string): string {
  const sheet = document.querySelector<HTMLStyleElement>('#diff-test-styles')!.sheet!;
  return [...sheet.cssRules]
    .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule && element.matches(rule.selectorText))
    .map((rule) => rule.style.getPropertyValue(property)).findLast((value) => value !== '') ?? '';
}

describe('split diff presentation', () => {
  it('keeps every paired row at a readable width inside one shared horizontal scroller', () => {
    const { container } = show();
    const hunk = container.querySelector('.diff-split')!;
    expect(getComputedStyle(hunk).overflowX).toBe('auto');
    const rows = container.querySelectorAll('.diff-split-row');
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.closest('.diff-split')).toBe(hunk);
      expect(getComputedStyle(row).minWidth).toBe('96ch');
      expect(getComputedStyle(row).display).toBe('flex');
      expect(getComputedStyle(row).alignItems).toBe('stretch');
      for (const cell of row.children) {
        const style = getComputedStyle(cell);
        expect(style.flexGrow).toBe('1');
        expect(style.flexShrink).toBe('1');
        expect(style.flexBasis).toBe('0px');
        expect(style.minWidth).toBe('0px');
      }
    }
  });

  it('keeps vertical scrolling on the body and wraps text within each column', () => {
    const { container } = show();
    expect(getComputedStyle(container.querySelector('.diff-body')!).overflowY).toBe('auto');
    expect(declaredStyle(container.querySelector('.diff-split')!, 'height')).toBe('');
    expect(declaredStyle(container.querySelector('.diff-split')!, 'max-height')).toBe('');
    for (const text of container.querySelectorAll('.diff-text')) {
      expect(getComputedStyle(text).whiteSpace).toBe('pre-wrap');
      expect(getComputedStyle(text).overflowWrap).toBe('break-word');
    }
  });

  it('shades the empty side of an unequal replacement without adding a number or marker', () => {
    const { container } = show();
    const rows = container.querySelectorAll('.diff-split-row');
    const last = rows[2];
    const old = last.querySelector('.diff-old')!;
    const empty = last.querySelector('.diff-new.diff-empty')!;
    expect(old.querySelector('.diff-number')?.textContent).toBe('3');
    expect(empty.querySelector('.diff-number')?.textContent).toBe('');
    expect(empty.querySelector('.diff-marker')?.textContent).toBe('');
    expect(declaredStyle(empty, 'background')).toBe('color-mix(in srgb, var(--muted) 5%, transparent)');
  });

  it('draws the original column divider on real rendered old-side cells', () => {
    const { container } = show();
    for (const old of container.querySelectorAll('.diff-old')) {
      expect(declaredStyle(old, 'border-right')).toBe('1px solid var(--border)');
    }
    for (const next of container.querySelectorAll('.diff-new')) {
      expect(declaredStyle(next, 'border-right')).toBe('');
    }
  });

  it.each([true, false])('applies change colors to rendered rows, gutters, markers, and character marks with split=%s', (split) => {
    const { container } = show(split);
    const prefix = split ? '.diff-cell' : '.diff-line';
    for (const [kind, color] of [['added', '--success'], ['removed', '--error']]) {
      const row = container.querySelector(`${prefix}.diff-${kind}`)!;
      expect(declaredStyle(row, 'background')).toBe(`color-mix(in srgb, var(${color}) 15%, transparent)`);
      expect(declaredStyle(row.querySelector('.diff-number')!, 'color'))
        .toBe(`color-mix(in srgb, var(${color}) 55%, var(--faint))`);
      expect(declaredStyle(row.querySelector('.diff-marker')!, 'color')).toBe(`var(${color})`);
      const changed = row.querySelector('.diff-changed.hljs-number')!;
      expect(changed).not.toBeNull();
      expect(declaredStyle(changed, 'background')).toBe(`color-mix(in srgb, var(${color}) 45%, transparent)`);
      expect(declaredStyle(changed, 'color')).toBe('');
    }
    const removed = container.querySelector(`${prefix}.diff-removed .diff-text`)!;
    expect(getComputedStyle(removed).textDecoration).not.toContain('line-through');
  });

  it.each([true, false])('renders removed code and its nested syntax and character marks without crossout with split=%s', (split) => {
    const { container } = show(split);
    const prefix = split ? '.diff-cell' : '.diff-line';
    const removed = container.querySelector(`${prefix}.diff-removed .diff-text`)!;
    expect(removed.textContent).toBe('const value = 30;');
    expect(removed.querySelector('.hljs-keyword')?.textContent).toBe('const');
    expect(removed.querySelector('.diff-changed.hljs-number')?.textContent).toBe('3');
    for (const span of [removed, ...removed.querySelectorAll('span')]) {
      expect(getComputedStyle(span).textDecoration).not.toContain('line-through');
      expect(declaredStyle(span, 'text-decoration')).toBe('');
    }
  });

  it('keeps unified wrapping free of the split minimum width and horizontal scroller', () => {
    const { container } = show(false);
    const hunk = container.querySelector('.diff-hunk')!;
    expect(getComputedStyle(hunk).overflowX).not.toBe('auto');
    expect(declaredStyle(hunk, 'min-width')).toBe('');
    expect(container.querySelector('.diff-split-row')).toBeNull();
    expect(getComputedStyle(container.querySelector('.diff-text')!).whiteSpace).toBe('pre-wrap');
  });
});
