import { afterEach, describe, expect, it } from 'vitest';
import styles from './diff.css?raw';

afterEach(() => { document.head.replaceChildren(); document.body.replaceChildren(); });

function loadStyles(): void {
  const style = document.createElement('style');
  style.textContent = styles;
  document.head.append(style);
}

function row(kind: string): { row: HTMLElement; text: HTMLElement } {
  const row = document.createElement('div');
  row.className = kind;
  const number = document.createElement('span');
  number.className = 'diff-number';
  const text = document.createElement('span');
  text.className = 'diff-text';
  row.append(number, text);
  document.body.append(row);
  return { row, text };
}

describe('diff styles', () => {
  it('wraps a line\'s text to the body\'s width at word boundaries', () => {
    loadStyles();
    const { text } = row('diff-line diff-context');
    expect(getComputedStyle(text).whiteSpace).toBe('pre-wrap');
    expect(getComputedStyle(text).overflowWrap).toBe('break-word');
  });

  it('breaks a token wider than the body rather than scrolling it out of view', () => {
    loadStyles();
    const { text } = row('diff-line diff-added');
    expect(getComputedStyle(text).minWidth).toBe('0px');
  });

  it.each(['diff-line diff-context', 'diff-cell diff-removed'])('never scrolls a %s row horizontally', (kind) => {
    loadStyles();
    expect(getComputedStyle(row(kind).row).overflowX).not.toBe('auto');
  });

  it('lets a file header scroll away with its entry rather than staying pinned', () => {
    loadStyles();
    const header = document.createElement('div');
    header.className = 'diff-file-header';
    document.body.append(header);
    expect(getComputedStyle(header).position).toBe('static');
  });

  it('sets consecutive file sections off with whitespace as well as the rule', () => {
    loadStyles();
    const first = document.createElement('div');
    first.className = 'diff-file';
    const second = document.createElement('div');
    second.className = 'diff-file';
    document.body.append(first, second);
    expect(getComputedStyle(first).marginTop).toBe('0');
    expect(getComputedStyle(second).marginTop).toBe('8px');
  });
});
