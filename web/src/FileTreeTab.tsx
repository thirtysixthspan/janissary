import React, { useEffect, useRef, useState } from 'react';
import type { FileTreeView, FileTreeRow } from '@shared/protocol';
import type { JanusClient } from './ws';
import { handleFileTreeKey, typeAheadMatch } from './file-tree-keys';

type Properties = {
  files: FileTreeView;
  client: JanusClient;
  index: number;
};

const TYPEAHEAD_RESET_MS = 700;
const ROW_HEIGHT_PX = 22;
// Printable, unmodified single characters — used for type-ahead. Excludes space (the action key).
const PRINTABLE = /^[ -~]$/;

function basename(root: string): string {
  return root.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || root;
}

export function FileTreeTab({ files, client, index }: Properties) {
  const [selected, setSelected] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef<{ buffer: string; timer?: ReturnType<typeof setTimeout> }>({ buffer: '' });

  useEffect(() => { containerRef.current?.focus(); }, []);

  // Selection clamp: if the selected row disappears (a watcher-driven rebuild), move to the
  // nearest surviving row instead of pointing at nothing.
  useEffect(() => {
    if (selected !== null && files.rows.every((r) => r.path !== selected)) {
      setSelected(files.rows[0]?.path ?? null);
    }
  }, [files.rows, selected]);

  const toggle = (path: string) => client.send({ method: 'fileTreeToggle', params: { index, path } });
  const openFile = (path: string) => client.send({ method: 'command', params: { text: `open ${path}` } });
  const editFile = (path: string) => client.send({ method: 'command', params: { text: `edit ${path}` } });

  const onRowClick = (row: FileTreeRow) => {
    setSelected(row.path);
  };

  const onRowDoubleClick = (row: FileTreeRow, shiftKey: boolean) => {
    if (row.dir) toggle(row.path);
    else if (shiftKey) editFile(row.path);
    else openFile(row.path);
  };

  const runAction = (action: { type: 'toggle' | 'open' | 'edit'; path: string } | undefined) => {
    if (!action) return;
    if (action.type === 'toggle') toggle(action.path);
    else if (action.type === 'open') openFile(action.path);
    else editFile(action.path);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) return; // tab-management chords go to the window handler
    const navKeys = new Set(['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Enter', ' ']);
    if (navKeys.has(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      const pageSize = Math.max(1, Math.floor((containerRef.current?.clientHeight ?? ROW_HEIGHT_PX * 10) / ROW_HEIGHT_PX));
      const result = handleFileTreeKey(files.rows, selected, e.key, e.shiftKey, pageSize);
      setSelected(result.selection);
      runAction(result.action);
      return;
    }
    if (PRINTABLE.test(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      const state = typeahead.current;
      clearTimeout(state.timer);
      state.buffer += e.key;
      const match = typeAheadMatch(files.rows, state.buffer);
      if (match) setSelected(match);
      state.timer = setTimeout(() => { state.buffer = ''; }, TYPEAHEAD_RESET_MS);
    }
  };

  return (
    <div className="files-tab" ref={containerRef} tabIndex={0} role="tree" onKeyDown={onKeyDown}>
      <div className="files-header">
        <span className="files-root">{basename(files.root)}</span>
        <button
          type="button"
          className="files-collapse-all"
          title="Collapse all"
          onClick={() => client.send({ method: 'fileTreeCollapseAll', params: { index } })}
        >
          ⊟
        </button>
      </div>
      <div className="files-rows">
        {files.rows.map((row) => (
          <div
            key={row.path}
            role="treeitem"
            aria-selected={row.path === selected}
            aria-expanded={row.dir ? !!row.expanded : undefined}
            className={`files-row${row.path === selected ? ' selected' : ''}`}
            style={{ paddingLeft: 12 + row.depth * 16 }}
            title={row.path}
            onClick={() => onRowClick(row)}
            onDoubleClick={(e) => onRowDoubleClick(row, e.shiftKey)}
          >
            {row.dir && <span className="files-chevron">{row.expanded ? '▾' : '▸'}</span>}
            <span className="files-name">{row.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
