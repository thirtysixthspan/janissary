import React, { createRef } from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EditorLine } from './render';
import type { TokenRange } from './highlight/tokenize';

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
});
