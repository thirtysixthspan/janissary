import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { FileTreeRow } from '@shared/protocol';
import { fileTreeRowClass } from './file-tree-row-class';
import { defaultRenameSelection } from './file-tree-rename';
import { expandedIcon, collapsedIcon } from './icons';

type Properties = {
  row: FileTreeRow;
  selected: string | null;
  dropTargetPath: string | undefined;
  editing: boolean;
  onCommitRename: (name: string) => void;
  onCancelRename: () => void;
  onClick: () => void;
  onDoubleClick: (shiftKey: boolean) => void;
  onMouseDown: (e: React.MouseEvent) => void;
};

// One file-tree row: the chevron, and either the static name span or (while `editing`) an
// in-place rename field pre-selected per `defaultRenameSelection`. Split out of `FileTreeTab` to
// keep it under the file-size limit.
export function FileTreeRowItem({
  row, selected, dropTargetPath, editing, onCommitRename, onCancelRename, onClick, onDoubleClick, onMouseDown,
}: Properties) {
  const cls = fileTreeRowClass(row, selected, dropTargetPath);
  return (
    <div
      role="treeitem"
      aria-selected={row.path === selected}
      aria-expanded={row.dir ? !!row.expanded : undefined}
      className={cls.row}
      data-path={row.path}
      style={{ paddingLeft: 12 + row.depth * 16 }}
      onClick={onClick}
      onDoubleClick={(e) => onDoubleClick(e.shiftKey)}
      onMouseDown={onMouseDown}
    >
      {row.dir && row.expanded !== undefined && <span className="files-chevron"><FontAwesomeIcon icon={row.expanded ? expandedIcon : collapsedIcon} /></span>}
      {editing ? (
        <input
          className="files-name-input"
          defaultValue={row.name}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); onCommitRename(e.currentTarget.value); }
            else if (e.key === 'Escape') { e.preventDefault(); onCancelRename(); }
          }}
          onBlur={onCancelRename}
          ref={(el) => {
            if (!el) return;
            el.focus();
            const { start, end } = defaultRenameSelection(row.name, !!row.dir);
            el.setSelectionRange(start, end);
          }}
        />
      ) : (
        <span className={cls.name}>{row.name}</span>
      )}
    </div>
  );
}
