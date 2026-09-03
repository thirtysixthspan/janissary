import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { FileNavigatorDetail, RemoteTarget } from '@shared/protocol';
import { nextDock, dockTooltip } from '../dock-cycle';
import { nextDetail, detailTooltip } from './file-navigator-detail';
import { dockSwapIcon, fileDetailIcon, newDirectoryIcon, newFileIcon, searchFilesIcon } from '../icons';
import { FileNavigatorGithubButton } from './FileNavigatorGithubButton';
import { FileNavigatorPullButton } from './FileNavigatorPullButton';
import { SplitTabButton } from '../SplitTabButton';
import { RemoteChip } from '../shared/RemoteChip';

type Properties = {
  root: string;
  remote?: RemoteTarget;
  branch?: string;
  githubUrl?: string;
  dock?: 'left' | 'right';
  details?: FileNavigatorDetail;
  onOpenGithub: (githubUrl: string) => void;
  onPull?: () => void;
  onCycleDock?: () => void;
  onSetDetail: (details: FileNavigatorDetail) => void;
  onCollapseAll: () => void;
  onSearch: () => void;
  onNewFile: () => void;
  onNewDirectory: () => void;
  onSplit?: () => void;
};

// The file navigator's metadata row: root/branch on the left, action buttons (GitHub link, search,
// new items, dock cycle, collapse all) on the right. Docked into a sidebar the row has no width for
// both on one line, so it stacks onto two — see `.files-header--docked`. Split out of
// `FileNavigatorTab` to keep it under the file-size limit.
export function FileNavigatorHeader({
  root, remote, branch, githubUrl, dock, details, onOpenGithub, onPull, onCycleDock, onSetDetail,
  onCollapseAll, onSearch, onNewFile, onNewDirectory, onSplit,
}: Properties) {
  const following = nextDetail(details);
  return (
    <div className={`files-header${dock ? ' files-header--docked' : ''}`}>
      <div className="files-meta">
        {remote && <RemoteChip remote={remote} />}
        <span className="files-loc">{root}</span>
        {branch && <span className="files-branch">{branch}</span>}
      </div>
      <div className="files-actions">
        {githubUrl && <FileNavigatorGithubButton onClick={() => onOpenGithub(githubUrl)} />}
        {onPull && <FileNavigatorPullButton onClick={onPull} />}
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
            onClick={onCycleDock}
          >
            <FontAwesomeIcon icon={dockSwapIcon} />
          </button>
        )}
        <button
          type="button"
          className="files-detail-cycle"
          title={detailTooltip(following)}
          onClick={() => onSetDetail(following)}
        >
          <FontAwesomeIcon icon={fileDetailIcon} />
        </button>
        {!dock && onSplit && <SplitTabButton onClick={onSplit} />}
        <button
          type="button"
          className="files-collapse-all"
          title="Collapse all"
          onClick={onCollapseAll}
        >
          ⊟
        </button>
      </div>
    </div>
  );
}
