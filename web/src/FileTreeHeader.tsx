import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { JanusClient } from './ws';
import { nextDock, dockTooltip } from './dock-cycle';
import { dockSwapIcon, newFileIcon, searchFilesIcon } from './icons';

type Properties = {
  root: string;
  branch?: string;
  client: JanusClient;
  index: number;
  dock?: 'left' | 'right';
  onSearch: () => void;
  onNewFile: () => void;
};

// The file navigator's metadata row: root/branch on the left, action buttons (search, new file,
// dock cycle, collapse all) on the right. Split out of `FileTreeTab` to keep it under the
// file-size limit.
export function FileTreeHeader({ root, branch, client, index, dock, onSearch, onNewFile }: Properties) {
  return (
    <div className="files-header">
      <div className="files-meta">
        <span className="files-loc">{root}</span>
        {branch && <span className="files-branch">{branch}</span>}
      </div>
      <div className="files-actions">
        <button type="button" className="files-search" title="Search files" onClick={onSearch}>
          <FontAwesomeIcon icon={searchFilesIcon} />
        </button>
        <button type="button" className="files-new-file" title="New file" onClick={onNewFile}>
          <FontAwesomeIcon icon={newFileIcon} />
        </button>
        {dock && (
          <button
            type="button"
            className="files-dock-cycle"
            title={dockTooltip(nextDock(dock))}
            onClick={() => client.send({ method: 'setDock', params: { index, dock: nextDock(dock) } })}
          >
            <FontAwesomeIcon icon={dockSwapIcon} />
          </button>
        )}
        <button
          type="button"
          className="files-collapse-all"
          title="Collapse all"
          onClick={() => client.send({ method: 'fileTreeCollapseAll', params: { index } })}
        >
          ⊟
        </button>
      </div>
    </div>
  );
}
