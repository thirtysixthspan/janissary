import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { FileTreeRow } from '@shared/protocol';
import { expandedIcon, collapsedIcon } from './icons';
import { InlineEditInput } from './InlineEditInput';

type Properties = {
  row: FileTreeRow;
  selected: string | null;
  rowClass: { row: string; name: string };
  editing: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onClick: () => void;
  onDoubleClick: (shiftKey: boolean) => void;
  onMouseDown: (e: React.MouseEvent) => void;
};

// One row of the file tree — kept out of `FileTreeTab.tsx` to stay under the file-size limit.
export function FileTreeRowView({
  row, selected, rowClass, editing, draft, onDraftChange, onCommit, onCancel, onClick, onDoubleClick, onMouseDown,
}: Properties) {
  return (
    <div
      role="treeitem"
      aria-selected={row.path === selected}
      aria-expanded={row.dir ? !!row.expanded : undefined}
      className={rowClass.row}
      data-path={row.path}
      style={{ paddingLeft: 12 + row.depth * 16 }}
      onClick={onClick}
      onDoubleClick={(e) => onDoubleClick(e.shiftKey)}
      onMouseDown={onMouseDown}
    >
      {row.dir && row.expanded !== undefined && <span className="files-chevron"><FontAwesomeIcon icon={row.expanded ? expandedIcon : collapsedIcon} /></span>}
      {editing ? (
        <InlineEditInput
          className="files-rename-input"
          value={draft}
          onClick={(e) => e.stopPropagation()}
          onChange={onDraftChange}
          onCommit={onCommit}
          onCancel={onCancel}
        />
      ) : (
        <span className={rowClass.name}>{row.name}</span>
      )}
    </div>
  );
}
