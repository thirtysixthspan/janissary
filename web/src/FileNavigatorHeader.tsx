import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { JanusClient } from './ws';
import { nextDock, dockTooltip } from './dock-cycle';
import { dockSwapIcon, newDirectoryIcon, newFileIcon, searchFilesIcon } from './icons';
import { FileNavigatorGithubButton } from './FileNavigatorGithubButton';

type Properties = {
  root: string;
  branch?: string;
  githubUrl?: string;
  client: JanusClient;
  index: number;
  dock?: 'left' | 'right';
  onSearch: () => void;
  onNewFile: () => void;
  onNewDirectory: () => void;
};

// The file navigator's metadata row: root/branch on the left, action buttons (GitHub link, search,
// new items, dock cycle, collapse all) on the right. Split out of `FileNavigatorTab` to keep it under
// the file-size limit.
export function FileNavigatorHeader({ root, branch, githubUrl, client, index, dock, onSearch, onNewFile, onNewDirectory }: Properties) {
  return (
    <div className="files-header">
      <div className="files-meta">
        <span className="files-loc">{root}</span>
        {branch && <span className="files-branch">{branch}</span>}
      </div>
      <div className="files-actions">
        {githubUrl && <FileNavigatorGithubButton githubUrl={githubUrl} client={client} />}
        <button type="button" className="files-search" title="Search files" onClick={onSearch}>
          <FontAwesomeIcon icon={searchFilesIcon} />
        </button>
        <button type="button" className="files-new-file" title="New file" onClick={onNewFile}>
          <FontAwesomeIcon icon={newFileIcon} />
        </button>
        <button type="button" className="files-new-directory" title="New directory" onClick={onNewDirectory}>
          <FontAwesomeIcon icon={newDirectoryIcon} />
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
          onClick={() => client.send({ method: 'fileNavigatorCollapseAll', params: { index } })}
        >
          ⊟
        </button>
      </div>
    </div>
  );
}
