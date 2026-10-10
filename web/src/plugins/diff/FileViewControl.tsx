import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowsUpDown } from '@fortawesome/free-solid-svg-icons';

const FULL_FILE_CONTEXT = 1_000_000;

export function FileViewControl({ collapsed, expanded, pending, error, cycle }: {
  collapsed: boolean;
  expanded: boolean;
  pending: boolean;
  error?: string;
  cycle(): Promise<unknown>;
}) {
  const [failure, setFailure] = useState('');
  const request = async () => {
    setFailure('');
    try { await cycle(); }
    catch (error_) { setFailure(error_ instanceof Error ? error_.message : String(error_)); }
  };
  return (
    <span className="diff-file-view-control" onDoubleClick={(event) => event.stopPropagation()}>
      <button type="button" className="diff-view-cycle" disabled={pending} aria-busy={pending}
        aria-expanded={!collapsed}
        aria-label="Cycle file view" title={collapsed ? 'Show changed lines' : expanded ? 'Close file' : 'Show full file'}
        onClick={() => { void request(); }}>
        <FontAwesomeIcon icon={faArrowsUpDown} />
      </button>
      {(error || failure) && <span role="alert">Context expansion failed: {error || failure}</span>}
    </span>
  );
}

export function isFullFileContext(lines: number | undefined): boolean {
  return lines === FULL_FILE_CONTEXT;
}
