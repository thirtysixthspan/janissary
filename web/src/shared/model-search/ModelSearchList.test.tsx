import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { ModelSearchList } from './ModelSearchList';
import type { ModelSearchRow } from './ModelSearchList';

const rows: ModelSearchRow[] = [
  { id: 'claude-sonnet-4', ranges: [[0, 6]] },
  { id: 'gpt-4o', ranges: [[4, 6]] },
];

function renderList(overrides: Partial<React.ComponentProps<typeof ModelSearchList>> = {}) {
  const onHover = vi.fn();
  const onPick = vi.fn();
  const utils = render(
    <ModelSearchList
      rows={rows}
      highlighted={0}
      blank={false}
      anchorRef={{ current: null }}
      onHover={onHover}
      onPick={onPick}
      {...overrides}
    />,
  );
  return { ...utils, onHover, onPick };
}

describe('ModelSearchList', () => {
  it('marks exactly the matched characters of a typed row', () => {
    const { container } = renderList();
    const marks = [...container.querySelectorAll(':scope .model-search-row mark')].map((m) => m.textContent);
    expect(marks).toEqual(['claude', '4o']);
  });

  it('renders most-used ids plainly with no marks and no muted row', () => {
    const mostUsed: ModelSearchRow[] = [
      { id: 'opus', ranges: [] },
      { id: 'sonnet', ranges: [] },
    ];
    const { container } = renderList({ blank: true, rows: mostUsed });
    expect(screen.getByText('opus')).toBeInTheDocument();
    expect(screen.getByText('sonnet')).toBeInTheDocument();
    expect(container.querySelectorAll('mark').length).toBe(0);
    expect(container.querySelector('.model-search-muted')).toBeNull();
  });

  it('prompts to type when there are no rows and the input is blank', () => {
    renderList({ rows: [], blank: true });
    expect(screen.getByText('type to search')).toBeInTheDocument();
  });

  it('reports no matching models when there are no rows for a typed query', () => {
    renderList({ rows: [], blank: false });
    expect(screen.getByText('No matching models')).toBeInTheDocument();
  });

  it('ignores hover and clicks on muted rows', () => {
    for (const blank of [true, false]) {
      const { onHover, onPick } = renderList({ rows: [], blank });
      const muted = screen.getByText(blank ? 'type to search' : 'No matching models');
      fireEvent.mouseEnter(muted);
      fireEvent.mouseDown(muted);
      fireEvent.click(muted);
      expect(onHover).not.toHaveBeenCalled();
      expect(onPick).not.toHaveBeenCalled();
    }
  });

  it('keeps focus in the input when a row is pressed', () => {
    const { container } = renderList();
    const pressed = fireEvent.mouseDown(container.querySelector('.model-search-row')!);
    expect(pressed).toBe(false);
  });

  it('reports the picked id on a row click', () => {
    const { container, onPick } = renderList();
    fireEvent.click(container.querySelectorAll('.model-search-row')[1]);
    expect(onPick).toHaveBeenCalledWith('gpt-4o');
  });

  it('reports the hovered row index on mouse-enter', () => {
    const { container, onHover } = renderList();
    fireEvent.mouseEnter(container.querySelectorAll('.model-search-row')[1]);
    expect(onHover).toHaveBeenCalledWith(1);
  });

  it('marks only the highlighted row', () => {
    const { container } = renderList({ highlighted: 1 });
    const elements = [...container.querySelectorAll('.model-search-row')];
    expect(elements[0].className).not.toContain('highlighted');
    expect(elements[1].className).toContain('highlighted');
  });

  it('marks no row when nothing is highlighted', () => {
    const { container } = renderList({ highlighted: null });
    const elements = [...container.querySelectorAll('.model-search-row')];
    expect(elements.every((element) => !element.className.includes('highlighted'))).toBe(true);
  });
});

type Measure = { input: { left: number; top: number; width: number; height: number }; listHeight: number };

function renderPositioned(measure: Measure, positionedRows: ModelSearchRow[] = rows) {
  const input = document.createElement('input');
  const anchorRef: React.RefObject<HTMLInputElement | null> = { current: input };
  const rectFor = (element: Element): DOMRect => {
    if (element === input) {
      const { left, top, width, height } = measure.input;
      return new DOMRect(left, top, width, height);
    }
    if (element.classList.contains('model-search-list')) {
      return new DOMRect(0, 0, 0, measure.listHeight);
    }
    return new DOMRect(0, 0, 0, 0);
  };
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function measure(this: Element) {
    // eslint-disable-next-line unicorn/no-this-outside-of-class -- a DOM method measures its own receiver
    return rectFor(this);
  });
  const element = (someRows: ModelSearchRow[]) => (
    <ModelSearchList
      rows={someRows}
      highlighted={0}
      blank={false}
      anchorRef={anchorRef}
      onHover={() => {}}
      onPick={() => {}}
    />
  );
  const utils = render(element(positionedRows));
  return {
    ...utils,
    rerenderRows: (someRows: ModelSearchRow[]) => utils.rerender(element(someRows)),
  };
}

describe('ModelSearchList placement', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens above the input when the list does not fit below', () => {
    const measure: Measure = {
      input: { left: 50, top: window.innerHeight - 18, width: 200, height: 20 },
      listHeight: 100,
    };
    const { container } = renderPositioned(measure);
    const list = container.querySelector('.model-search-list')!;
    expect(list.classList.contains('model-search-above')).toBe(true);
  });

  it('drops the above placement when a new rows array fits below', () => {
    const measure: Measure = {
      input: { left: 50, top: window.innerHeight - 18, width: 200, height: 20 },
      listHeight: 100,
    };
    const { container, rerenderRows } = renderPositioned(measure);
    const list = container.querySelector('.model-search-list')!;
    expect(list.classList.contains('model-search-above')).toBe(true);

    measure.input = { left: 50, top: 100, width: 200, height: 20 };
    rerenderRows([{ id: 'new-id', ranges: [] }]);
    expect(list.classList.contains('model-search-above')).toBe(false);
  });

  it('sets the inline min and max width from the input and the viewport', () => {
    const measure: Measure = {
      input: { left: 50, top: 100, width: 200, height: 20 },
      listHeight: 40,
    };
    const { container } = renderPositioned(measure);
    const list = container.querySelector('.model-search-list') as HTMLElement;
    expect(list.style.minWidth).toBe('200px');
    expect(list.style.maxWidth).toBe(`${window.innerWidth - 50}px`);
  });
});
