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
  it('keeps the refresh control light on its dark background', () => {
    loadStyles();
    const refresh = [...document.styleSheets[0].cssRules].find((item) => item instanceof CSSStyleRule
      && item.selectorText === '.diff-refresh');
    expect(refresh).toBeInstanceOf(CSSStyleRule);
    if (!(refresh instanceof CSSStyleRule)) throw new Error('Missing refresh button rule');
    expect(refresh.style.getPropertyValue('color')).toBe('var(--fg)');
    expect(refresh.style.getPropertyValue('background')).toBe('transparent');
  });

  it.each([
    'diff-line diff-context', 'diff-line diff-added',
    'diff-cell diff-context', 'diff-cell diff-added',
  ])('shows a pointer cursor for a %s code row', (kind) => {
    loadStyles();
    expect(getComputedStyle(row(kind).row).cursor).toBe('pointer');
  });

  it.each(['diff-line diff-removed', 'diff-cell diff-removed'])('keeps a %s code row inert', (kind) => {
    loadStyles();
    expect(getComputedStyle(row(kind).row).cursor).toBe('default');
  });

  it('tints hovered code rows in both layouts without replacing change backgrounds', () => {
    loadStyles();
    const rules = [...document.styleSheets[0].cssRules];
    const hover = rules.find((rule) => rule instanceof CSSStyleRule
      && rule.selectorText === '.diff-line:not(.diff-removed):hover, .diff-cell:not(.diff-empty):not(.diff-removed):hover');
    expect(hover).toBeInstanceOf(CSSStyleRule);
    if (!(hover instanceof CSSStyleRule)) throw new Error('Missing code-row hover rule');
    expect(hover.style.getPropertyValue('box-shadow'))
      .toBe('inset 0 0 0 100vmax color-mix(in srgb, var(--accent) 12%, transparent)');
    expect(hover.style.getPropertyValue('background')).toBe('');
    expect(hover.style.getPropertyValue('background-color')).toBe('');
    expect(row('diff-cell diff-empty').row.matches(hover.selectorText.replaceAll(':hover', ''))).toBe(false);
    expect(row('diff-cell diff-removed').row.matches(hover.selectorText.replaceAll(':hover', ''))).toBe(false);
  });

  it('keeps empty split placeholders on the hunk text cursor', () => {
    loadStyles();
    const hunk = document.createElement('div');
    hunk.className = 'diff-hunk';
    const placeholder = row('diff-cell diff-empty').row;
    hunk.append(placeholder);
    document.body.append(hunk);
    expect(getComputedStyle(hunk).cursor).toBe('text');
    expect(getComputedStyle(placeholder).cursor).not.toBe('pointer');
  });

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

  it('tints an added row\'s gutter and marker toward the addition color, and a removed row\'s toward the removal color', () => {
    // Stated as matches rather than computed styles: jsdom resolves no `var()` and no `color-mix()`,
    // so a computed color would look identical to the faint gray the requirement is argued against.
    const gutterAdded = styles.match(/^\.diff-line\.added \.diff-number, \.diff-cell\.added \.diff-number \{[^}]+\}/m)?.[0];
    const gutterRemoved = styles.match(/^\.diff-line\.removed \.diff-number, \.diff-cell\.removed \.diff-number \{[^}]+\}/m)?.[0];
    const markerAdded = styles.match(/^\.diff-line\.added \.diff-marker, \.diff-cell\.added \.diff-marker \{[^}]+\}/m)?.[0];
    const markerRemoved = styles.match(/^\.diff-line\.removed \.diff-marker, \.diff-cell\.removed \.diff-marker \{[^}]+\}/m)?.[0];
    for (const rule of [gutterAdded, gutterRemoved, markerAdded, markerRemoved]) expect(rule).toBeDefined();
    expect(gutterAdded).toContain('color-mix(in srgb, var(--success)');
    expect(gutterRemoved).toContain('color-mix(in srgb, var(--error)');
    expect(markerAdded).toContain('color: var(--success)');
    expect(markerRemoved).toContain('color: var(--error)');
  });
});
