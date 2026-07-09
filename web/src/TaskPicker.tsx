import React, { useEffect, useRef } from 'react';
import type { VisibleTaskRow } from './task-picker-keys';

// The Ctrl+A / `tasks` overlay listing the executable `ai/*.md` task files, recursively including
// any subdirectory's tasks (collapsed by default). Up/Down move the selection, Left/Right
// collapse/expand a directory or move to its parent, Enter toggles a directory or copies
// `execute ./ai/<path>` into the command line without submitting, Escape closes — handled by
// App's key handler; a row can also be clicked (toggling a directory, picking a file).
type Properties = { rows: VisibleTaskRow[]; selected: number; onPick: (path: string) => void; onToggleDir: (path: string) => void };

export function TaskPicker({ rows, selected, onPick, onToggleDir }: Properties) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll the selected row into view when selection changes (nearest block
  // alignment avoids unnecessary scroll when the element is already visible).
  useEffect(() => {
    containerRef.current?.querySelector('.picker-row.selected')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  return (
    <div className="picker" data-doc-shot="task-overlay" ref={containerRef}>
      <div className="picker-title">tasks</div>
      {rows.length === 0 ? (
        <div className="picker-row picker-empty">(no tasks)</div>
      ) : (
        rows.map((row, index) => (
          <div
            key={row.path}
            className={`picker-row${index === selected ? ' selected' : ''}`}
            style={{ paddingLeft: 12 + row.depth * 16 }}
            onClick={() => (row.dir ? onToggleDir(row.path) : onPick(row.path))}
          >
            {row.dir && <span className="picker-chevron">{row.expanded ? '▾' : '▸'}</span>}
            {row.dir ? row.name : row.name.replace(/\.md$/, '')}
          </div>
        ))
      )}
    </div>
  );
}
