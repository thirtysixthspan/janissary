import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { EditorState } from './model';
import type { EditorSuggestApi, QueryLine } from './useEditorSuggest';
import { EditorLines } from './EditorLines';

function makeState(): EditorState {
  return { lines: ['some text', '', 'more text'], cursor: { line: 1, col: 0 }, anchor: null };
}

function makeSuggest(queryLine: QueryLine | null): EditorSuggestApi {
  return {
    personas: [],
    pending: null,
    firingLine: null,
    noSuggestionLine: null,
    queryLine,
    pillFocused: false,
    setPillFocused: vi.fn(),
    focusTarget: queryLine ? 'query' : 'buffer',
    setFocusTarget: vi.fn(),
    openQueryLine: vi.fn(),
    closeQueryLine: vi.fn(),
    setQueryLineState: vi.fn(),
    fireOnLine: vi.fn(),
    acceptHunk: vi.fn(),
    declineHunk: vi.fn(),
  };
}

describe('EditorLines gutter numbering around an open query line', () => {
  it('keeps the line before the anchor numbered normally, hides the query row number, and does not skip a number after it', () => {
    const suggest = makeSuggest({ anchorLine: 1, state: { lines: ['>'], cursor: { line: 0, col: 1 }, anchor: null } });
    const { container } = render(
      <EditorLines state={makeState()} tokens={[[], [], []]} suggest={suggest} active gutterCh={2} caretRef={null} />,
    );
    const gutters = [...container.querySelectorAll('.editor-gutter')].map((g) => g.textContent);
    expect(gutters).toEqual(['1', '', '2']);
  });

  it('numbers the same row 3 when no query line is open', () => {
    const suggest = makeSuggest(null);
    const { container } = render(
      <EditorLines state={makeState()} tokens={[[], [], []]} suggest={suggest} active gutterCh={2} caretRef={null} />,
    );
    const gutters = [...container.querySelectorAll('.editor-gutter')].map((g) => g.textContent);
    expect(gutters).toEqual(['1', '2', '3']);
  });
});
