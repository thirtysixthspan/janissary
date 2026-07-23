import React, { createRef } from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EditorLine, DiffAddedLine } from './render';
import type { TokenRange } from './highlight/tokenize';
import type { SuggestPill } from './suggest-request';

describe('EditorLine token segments', () => {
  it('emits an hljs-* class for a token range', () => {
    const tokens: TokenRange[] = [{ from: 0, to: 5, scope: 'hljs-keyword' }];
    const { container } = render(
      <EditorLine text="const x = 1;" line={0} gutterCh={2} isCurrent={false} selFrom={-1} selTo={-1} caretCol={-1} caretRef={null} tokens={tokens} />,
    );
    const span = [...container.querySelectorAll(':scope .editor-content span')].find((s) => s.textContent === 'const');
    expect(span?.className).toBe('hljs-keyword');
  });

  it('combines a token class with editor-sel when a selection overlaps a token', () => {
    const tokens: TokenRange[] = [{ from: 0, to: 5, scope: 'hljs-keyword' }];
    const { container } = render(
      <EditorLine text="const x = 1;" line={0} gutterCh={2} isCurrent={false} selFrom={0} selTo={5} caretCol={-1} caretRef={null} tokens={tokens} />,
    );
    const span = [...container.querySelectorAll(':scope .editor-content span')].find((s) => s.textContent === 'const');
    expect(span?.className).toBe('hljs-keyword editor-sel');
  });

  it('places the caret exactly between segments when it falls inside a token', () => {
    const tokens: TokenRange[] = [{ from: 0, to: 5, scope: 'hljs-keyword' }];
    const caretRef = createRef<HTMLSpanElement>();
    const { container } = render(
      <EditorLine text="const x = 1;" line={0} gutterCh={2} isCurrent caretCol={2} caretRef={caretRef} selFrom={-1} selTo={-1} tokens={tokens} />,
    );
    const spans = [...container.querySelectorAll(':scope .editor-content > span')];
    const caretIndex = spans.findIndex((s) => s.classList.contains('editor-caret'));
    expect(caretIndex).toBeGreaterThan(-1);
    expect(spans[caretIndex - 1]?.textContent).toBe('co');
    expect(spans[caretIndex + 1]?.textContent).toBe('nst');
    expect(spans[caretIndex - 1]?.className).toBe('hljs-keyword');
    expect(spans[caretIndex + 1]?.className).toBe('hljs-keyword');
  });

  it('renders no class for plain (non-token, non-selected) text', () => {
    const { container } = render(
      <EditorLine text="plain text" line={0} gutterCh={2} isCurrent={false} selFrom={-1} selTo={-1} caretCol={-1} caretRef={null} tokens={[]} />,
    );
    const span = container.querySelector(':scope .editor-content span');
    expect(span?.className).toBe('');
  });

  it('adds editor-diff-remove to the row when removed is set', () => {
    const { container } = render(
      <EditorLine text="old line" line={0} gutterCh={2} isCurrent={false} selFrom={-1} selTo={-1} caretCol={-1} caretRef={null} tokens={[]} removed />,
    );
    expect(container.querySelector('.editor-row')?.className).toContain('editor-diff-remove');
  });

  it('shows the 1-based line number in the gutter for an ordinary (non-query) row', () => {
    const { container } = render(
      <EditorLine text="plain text" line={4} gutterCh={2} isCurrent={false} selFrom={-1} selTo={-1} caretCol={-1} caretRef={null} tokens={[]} />,
    );
    expect(container.querySelector('.editor-gutter')?.textContent).toBe('5');
  });
});

describe('EditorLine suggestion pill', () => {
  const pill: SuggestPill = { text: 'run', runnable: true };

  it('adds editor-suggest-pill-focused when pillFocused is set', () => {
    const { container } = render(
      <EditorLine text="> summarizer go" line={0} gutterCh={2} isCurrent selFrom={-1} selTo={-1} caretCol={-1} caretRef={null} tokens={[]} pill={pill} pillFocused />,
    );
    expect(container.querySelector('.editor-suggest-pill')?.className).toContain('editor-suggest-pill-focused');
  });

  it('omits editor-suggest-pill-focused when pillFocused is not set', () => {
    const { container } = render(
      <EditorLine text="> summarizer go" line={0} gutterCh={2} isCurrent selFrom={-1} selTo={-1} caretCol={-1} caretRef={null} tokens={[]} pill={pill} />,
    );
    expect(container.querySelector('.editor-suggest-pill')?.className).not.toContain('editor-suggest-pill-focused');
  });
});

describe('EditorLine query row', () => {
  it('renders the > marker, caret, and editor-row-query class when empty, with no placeholder span', () => {
    const caretRef = createRef<HTMLSpanElement>();
    const { container } = render(
      <EditorLine
        text=">" line={2} gutterCh={2} isCurrent selFrom={-1} selTo={-1} caretCol={1} caretRef={caretRef}
        tokens={[]} query
      />,
    );
    expect(container.querySelector('.editor-row')?.className).toContain('editor-row-query');
    expect(container.querySelector('.editor-content')?.textContent?.replaceAll('\u{200B}', '')).toBe('>');
    expect(container.querySelector('.editor-placeholder')).toBeNull();
    expect(container.querySelector('.editor-caret')).toBeInTheDocument();
    expect(container.querySelector('.editor-gutter')?.textContent).toBe('');
  });

  it('suppresses the caret when the row is not active', () => {
    const { container } = render(
      <EditorLine
        text=">" line={2} gutterCh={2} isCurrent selFrom={-1} selTo={-1} caretCol={-1} caretRef={null}
        tokens={[]} query
      />,
    );
    expect(container.querySelector('.editor-caret')).toBeNull();
  });
});

describe('DiffAddedLine', () => {
  it('renders the added text with a + gutter and no line number', () => {
    const { container } = render(<DiffAddedLine text="new line" gutterCh={2} />);
    expect(container.querySelector('.editor-gutter')?.textContent).toBe('+');
    expect(container.querySelector('.editor-content')?.textContent).toBe('new line');
    expect(container.querySelector('.editor-row')?.className).toContain('editor-diff-add');
  });
});
