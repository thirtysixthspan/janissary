import { useLayoutEffect, useRef } from 'react';
import type React from 'react';
import { highlightRanges } from '../line-find/LineFind';
import { listPlacement, scrollBox } from './list-placement';

export type ModelSearchRow = { id: string; ranges: [number, number][] };

type Properties = {
  rows: ModelSearchRow[];
  highlighted: number | null;
  blank: boolean;
  anchorRef: React.RefObject<HTMLInputElement | null>;
  onHover: (index: number) => void;
  onPick: (id: string) => void;
};

export function ModelSearchList({ rows, highlighted, blank, anchorRef, onHover, onPick }: Properties) {
  const listRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const input = anchorRef.current;
    const list = listRef.current;
    if (!input || !list) return;
    const inputRect = input.getBoundingClientRect();
    const box = scrollBox(list);
    list.style.minWidth = `${inputRect.width}px`;
    list.style.maxWidth = `${listPlacement(inputRect, box, 0).maxWidth}px`;
    const height = list.getBoundingClientRect().height;
    list.classList.toggle('model-search-above', listPlacement(inputRect, box, height).above);
  }, [rows, anchorRef]);

  if (rows.length === 0) {
    return (
      <div ref={listRef} className="model-search-list">
        <div className="model-search-row model-search-muted">
          {blank ? 'type to search' : 'No matching models'}
        </div>
      </div>
    );
  }
  return (
    <div ref={listRef} className="model-search-list">
      {rows.map((row, index) => (
        <div
          key={row.id}
          className={`model-search-row${index === highlighted ? ' highlighted' : ''}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(row.id)}
          onMouseEnter={() => onHover(index)}
        >
          {highlightRanges(row.id, row.ranges)}
        </div>
      ))}
    </div>
  );
}
