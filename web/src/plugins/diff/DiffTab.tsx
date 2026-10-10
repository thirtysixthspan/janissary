import React, { useCallback, useLayoutEffect, useRef } from 'react';
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
  const fullFileScroll = useRef<number | null>(null);

  useDiffRefresh(useCallback(() => capabilities.intent('refresh', {}), [capabilities]));
  const walk = useHunkWalk(files);

  // A workspace diff whose workspace is gone — the clone deleted, the remote session ended — has
  // nothing left to read, so it closes itself rather than sitting on a directory that is not there.
  // The project-root diff says so instead: a directory that is not a repository there is an answer,
  // not a loss.
  React.useEffect(() => {
    if (payload.workspace === true && payload.state === 'not-repository') capabilities.close();
  }, [payload.workspace, payload.state, capabilities]);

  const openFile = useCallback((path: string) => {
    void capabilities.intent('open', { path, line: 1 });
  }, [capabilities]);
  const openLine = useCallback((path: string, line: number) => {
    void capabilities.intent('open', { path, line });
  }, [capabilities]);
  const openMedia = useCallback((path: string) => {
    void capabilities.intent('open-media', { path });
  }, [capabilities]);
  useLayoutEffect(() => {
    if (fullFileScroll.current === null || files.some((file) => file.expandingContext) || !walk.listRef.current) return;
    walk.listRef.current.scrollTop = fullFileScroll.current;
    fullFileScroll.current = null;
  }, [files, walk.listRef]);

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && walk.spot
      && handleFileArrow(walk.listRef.current?.querySelectorAll('.diff-file')[walk.spot.file], event.key)) {
      event.preventDefault();
      return;
    }
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
        {payload.host !== undefined && (
          <span className="plugin-loc diff-host" title={`Read on ${payload.host}`}>on {payload.host}</span>
        )}
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
          {capabilities.splitAction}
        </span>
      </div>
      <div
        className="diff-body"
        ref={walk.listRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        {payload.state === 'not-repository' && <div className="diff-empty">This directory is not a git repository</div>}
        {payload.state === 'error' && <div className="diff-empty">{payload.message}</div>}
        {payload.state === 'done' && files.length === 0 && <div className="diff-empty">No changes</div>}
        {files.map((file, index) => (
          <FileEntry
            key={JSON.stringify([payload.root, file.path])}
            file={file}
            split={split}
            offset={hunkOffset(files, index)}
            walked={walk.selected}
            hasWalkedHunk={walk.spot?.file === index}
            onSelectHunk={walk.rowClicked}
            onOpenFile={() => openFile(file.path)}
            onOpenLine={(line) => openLine(file.path, line.jump)}
            onOpenMedia={() => openMedia(file.path)}
            onToggleFullFile={(fullFile) => {
              fullFileScroll.current = walk.listRef.current?.scrollTop ?? 0;
              return capabilities.intent('context', { path: file.path, fullFile });
            }}
          />
        ))}
      </div>
    </div>
  );
}

function handleFileArrow(entry: Element | undefined, key: 'ArrowLeft' | 'ArrowRight'): boolean {
  if (!entry) return false;
  const control = entry.querySelector<HTMLButtonElement>(':scope .diff-view-cycle');
  if (!control) return false;
  if (key === 'ArrowLeft') {
    if (control.getAttribute('aria-expanded') !== 'true') return false;
    entry.querySelector<HTMLElement>(':scope .diff-file-header')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    return true;
  }
  control.click();
  return true;
}
