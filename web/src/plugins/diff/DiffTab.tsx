import React, { useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlusMinus } from '@fortawesome/free-solid-svg-icons';
import type { DiffPayload } from '@shared/plugins/diff/shared';
import type { TabPluginClientCapabilities } from '../api';
import { FileEntry } from './FileEntry';
import { hunkOffset } from './hunk-index';
import { useDiffRefresh } from './useDiffRefresh';
import { useHunkWalk } from './useHunkWalk';

// The diff tab: a metadata header naming the diffed root with the view controls beside it, and the
// change set below — one entry per changed file, every hunk expanded, GitHub's files-changed layout.
// The body is the tab's one focusable region: clicking into it or tabbing to it gives the keyboard
// walk the arrows, and Return opens the file at the walked hunk's first changed line. The layout the
// payload names is the layout the session saved, so the layout toggle asks for the other one rather
// than keeping a layout of its own.
export function DiffTab({
  payload, capabilities,
}: {
  payload: DiffPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  const split = payload.split;
  const setLayout = (next: boolean) => { void capabilities.intent('layout', { split: next }); };
  const files = payload.files;

  const refresh = useDiffRefresh(
    useCallback(() => capabilities.intent('refresh', {}), [capabilities]),
  );
  const walk = useHunkWalk(files);

  const openFile = useCallback((path: string) => {
    void capabilities.intent('open', { path, line: 1 });
  }, [capabilities]);
  const openLine = useCallback((path: string, line: number) => {
    void capabilities.intent('open', { path, line });
  }, [capabilities]);
  const openMedia = useCallback((path: string) => {
    void capabilities.intent('open-media', { path });
  }, [capabilities]);

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (walk.navigate(event.key)) { event.preventDefault(); return; }
    if (event.key === 'j' || event.key === 'k') {
      if (walk.moveFile(event.key === 'j')) { event.preventDefault(); }
      return;
    }
    if (event.key === 'Enter' && walk.spot) {
      event.preventDefault();
      openLine(files[walk.spot.file].path, walk.spot.line);
    }
  }, [walk, files, openLine]);

  return (
    <div className="plugin-tab diff-tab">
      <div className="plugin-meta">
        <span className="plugin-loc diff-root" title={payload.root}>{payload.root}</span>
        <span className="plugin-actions">
          <span className="diff-view">
            <button
              type="button"
              className={split ? 'on' : ''}
              aria-label="Diff layout"
              aria-pressed={split}
              title={split ? 'Switch to unified layout' : 'Switch to split layout'}
              onClick={() => setLayout(!split)}
            >
              <FontAwesomeIcon icon={faPlusMinus} />
            </button>
          </span>
          <button type="button" className="diff-refresh" title="Refresh" aria-label="Refresh" onClick={refresh.refresh}>
            ⟳
          </button>
          {capabilities.splitAction}
        </span>
      </div>
      <div
        className="diff-body"
        ref={walk.listRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        title="j and k move between files; the arrows walk the hunks; Return opens the walked hunk's line"
      >
        {payload.state === 'not-repository' && <div className="diff-empty">This directory is not a git repository</div>}
        {payload.state === 'error' && <div className="diff-empty">{payload.message}</div>}
        {payload.state === 'done' && files.length === 0 && <div className="diff-empty">No changes</div>}
        {files.map((file, index) => (
          <FileEntry
            key={file.path}
            file={file}
            split={split}
            offset={hunkOffset(files, index)}
            walked={walk.selected}
            onSelectHunk={walk.rowClicked}
            onOpenFile={() => openFile(file.path)}
            onOpenLine={(line) => openLine(file.path, line.jump)}
            onOpenMedia={() => openMedia(file.path)}
          />
        ))}
      </div>
    </div>
  );
}
