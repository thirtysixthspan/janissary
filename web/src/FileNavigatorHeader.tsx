import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { FileNavigatorDetail, FileNavigatorView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { nextDock, dockTooltip } from './dock-cycle';
import { nextDetail, detailTooltip } from './file-navigator-detail';
import { dockSwapIcon, fileDetailIcon, newDirectoryIcon, newFileIcon, searchFilesIcon, syncIcon } from './icons';
import { FileNavigatorGithubButton } from './FileNavigatorGithubButton';
import { SplitTabButton } from './SplitTabButton';

type Properties = {
  root: string;
  branch?: string;
  githubUrl?: string;
  sync?: FileNavigatorView['sync'];
  client: JanusClient;
  index: number;
  dock?: 'left' | 'right';
  details?: FileNavigatorDetail;
  onSearch: () => void;
  onNewFile: () => void;
  onNewDirectory: () => void;
  onSplit?: () => void;
};

const SYNC_TITLES: Record<NonNullable<FileNavigatorView['sync']>, string> = {
  syncing: 'GitHub sync: syncing',
  synced: 'GitHub sync: synced — click to refresh',
  error: 'GitHub sync: error — click to retry',
};

// The file navigator's metadata row: root/branch on the left, action buttons (GitHub link, search,
// new items, dock cycle, collapse all) on the right. Split out of `FileNavigatorTab` to keep it under
// the file-size limit.
export function FileNavigatorHeader({
  root, branch, githubUrl, sync, client, index, dock, details, onSearch, onNewFile, onNewDirectory, onSplit,
}: Properties) {
  const following = nextDetail(details);
  return (
    <div className="files-header">
      <div className="files-meta">
        <span className="files-loc">{root}</span>
        {branch && <span className="files-branch">{branch}</span>}
      </div>
      <div className="files-actions">
        {sync && (
          <button
            type="button"
            className={`files-sync files-sync--${sync}`}
            title={SYNC_TITLES[sync]}
            disabled={sync === 'syncing'}
            onClick={() => client.send({ method: 'resyncFileNavigator', params: { index } })}
          >
            <FontAwesomeIcon icon={syncIcon} />
          </button>
        )}
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
          className="files-detail-cycle"
          title={detailTooltip(following)}
          onClick={() => client.send({ method: 'fileNavigatorSetDetail', params: { index, details: following } })}
        >
          <FontAwesomeIcon icon={fileDetailIcon} />
        </button>
        {!dock && onSplit && <SplitTabButton onClick={onSplit} />}
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
